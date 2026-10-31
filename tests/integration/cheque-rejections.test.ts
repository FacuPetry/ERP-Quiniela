import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  SessionResponse,
  ChequeRejectionInput,
  ChequeRejectionResult,
} from "@erp/shared";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createApp } from "../../apps/api/src/app.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";
import {
  chequeDeposit,
  chequeAccreditation,
  chequeRejection,
  valueQuery,
} from "../../apps/api/src/values/validation.js";
import { pendingQuery } from "../../apps/api/src/cash-movement/validation.js";
import { effectiveBankMovement } from "../../apps/api/src/database/bank-movements.js";

test("Rechazo: deuda por instrumento, anticipo, banco y trazabilidad", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_HOST, "127.0.0.1");
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  t.after(() => pool.end());
  const rows = async (sql: string, params: unknown[] = []) =>
    (await pool.execute<RowDataPacket[]>(sql, params))[0];
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('RJ_READ','Consulta rechazo')",
  );
  const password = randomBytes(24).toString("hex"),
    hash = await hashPassword(password);
  for (const role of ["ADMIN", "RJ_READ"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [role, role + "-rejection@example.invalid", hash, role, new Date()],
    );
  const user = String(
    (
      await rows(
        "SELECT IDTabla FROM USUARIO WHERE Email='ADMIN-rejection@example.invalid'",
      )
    )[0]!.IDTabla,
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('RJ_T','Tipo rechazo')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('RJ_C','Cliente rechazo','RJ_T')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('RJ_BOX','Caja rechazos')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('RJ_B','Banco rechazos')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('RJ_ACC','RJ_B','Cuenta rechazos','ERP')",
  );
  await pool.query(
    "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES ('RJ_DEBT','Deuda inicial','CUENTACORRIENTE','COBRAR','DEUDA','NOAPLICA'),('RJ_RECH','Rechazo de cheque','CUENTACORRIENTE','COBRAR','DEUDA','NOAPLICA'),('RJ_MANUAL','Rechazo manual','CUENTACORRIENTE','COBRAR','DEUDA','NOAPLICA'),('RJ_IN','Recibo rechazo','COBROSPAGOS','COBRAR','CREDITO','INGRESO'),('RJ_OUT','Pago rechazo','COBROSPAGOS','PAGAR','CREDITO','EGRESO')",
  );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('RJ_N',900000001)",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET Numerador='RJ_N' WHERE Codigo='RJ_RECH'",
  );
  const cash = createCashMovementStore(pool),
    cc = createCurrentAccountStore(pool),
    values = createValuesStore(pool);
  const box = await cash.open(
    { Caja: "RJ_BOX", SaldoInicial: "0.00" },
    user,
    randomUUID(),
  );
  let n = 600000001n,
    chequeNumber = 1;
  const fixture = async (
    amounts: string[],
    originalDebt: string,
    efectivo = "0.00",
  ) => {
    const totalUnits =
      amounts.reduce((a, v) => a + BigInt(v.replace(".", "")), 0n) +
      BigInt(efectivo.replace(".", ""));
    const total =
      (totalUnits / 100n).toString() +
      "." +
      (totalUnits % 100n).toString().padStart(2, "0");
    let debt: string | null = null;
    if (originalDebt !== "0.00")
      debt = (
        await cc.create(
          {
            Cliente: "RJ_C",
            Comprobante: "RJ_DEBT",
            NumeroComprobante: (n++).toString(),
            NumeroAutomatico: false,
            FechaOrigen: "2026-10-25",
            Vencimiento: null,
            Importe: originalDebt,
            Observacion: null,
          },
          user,
          randomUUID(),
        )
      ).registro.IDTabla;
    const input: CashInput = {
      Comprobante: "RJ_IN",
      NumeroComprobante: (n++).toString(),
      NumeroAutomatico: false,
      Cliente: "RJ_C",
      FechaOrigen: "2026-10-26",
      CajaSaldo: box.IDTabla,
      Concepto: null,
      ImporteEfectivo: efectivo,
      ImporteACuenta:
        (
          (totalUnits - BigInt(originalDebt.replace(".", ""))) /
          100n
        ).toString() +
        "." +
        ((totalUnits - BigInt(originalDebt.replace(".", ""))) % 100n)
          .toString()
          .padStart(2, "0"),
      Observacion: null,
      Afectaciones: debt
        ? [{ CuentaCorriente: debt, Importe: originalDebt }]
        : [],
      Valores: amounts.map((Importe) => ({
        Tipo: "TERCERO",
        Banco: "RJ_B",
        BancoCuenta: null,
        CuentaLibradora: "RJ001",
        Numero: String(chequeNumber++),
        Librador: "Librador rechazo",
        Documento: null,
        Emision: "2026-10-25",
        Vencimiento: "2026-11-10",
        Importe,
      })),
    };
    const received = await cash.create(input, user, randomUUID());
    return { received, ids: received.valores.map((v) => v.IDTabla), debt };
  };
  const mixed = await fixture(["60.00"], "100.00", "40.00"),
    credited = await fixture(["150000.00"], "150000.00"),
    advance = await fixture(["100.00"], "80.00"),
    pair = await fixture(["40.00", "60.00"], "80.00"),
    onlyAdvance = await fixture(["50.00"], "0.00"),
    concurrent = await fixture(["10.00"], "10.00"),
    rollback = await fixture(["20.00"], "10.00"),
    race = await fixture(["11.00"], "11.00"),
    manual = await fixture(["33.00"], "33.00"),
    portfolio = await fixture(["30.00"], "30.00");
  for (const f of [
    mixed,
    credited,
    advance,
    pair,
    onlyAdvance,
    concurrent,
    rollback,
    race,
    manual,
  ])
    await values.deposit(
      chequeDeposit.parse({
        Cheques: f.ids,
        BancoCuenta: "RJ_ACC",
        Fecha: "2026-10-27",
        Observacion: null,
      }),
      user,
      randomUUID(),
    );
  await values.accredit(
    chequeAccreditation.parse({
      Cheques: [...credited.ids, ...rollback.ids],
      Fecha: "2026-10-28",
      Observacion: null,
    }),
    user,
    randomUUID(),
  );
  await cash.close(
    box.IDTabla,
    { SaldoContado: "40.00", Observacion: null },
    user,
    randomUUID(),
  );
  const baseInput = (bank = false): ChequeRejectionInput => ({
    Comprobante: "RJ_RECH",
    NumeroComprobante: "0",
    NumeroAutomatico: true,
    Fecha: "2026-10-31",
    Motivo: "Sin fondos",
    ConfirmarDebitoBancario: bank,
    FechaDebito: bank ? "2026-10-31" : null,
  });
  const reject = async (
    id: string,
    input = baseInput(),
    version?: string,
    key = randomUUID(),
  ) =>
    values.reject(
      id,
      chequeRejection.parse(input),
      version ?? (await values.rejectionPreview(id)).version,
      user,
      key,
    );
  const snapshot = (tables: string[]) =>
    Promise.all(
      tables.map((name) => rows(`SELECT * FROM ${name} ORDER BY IDTabla`)),
    );
  const tables = [
    "CHEQUE",
    "CHEQUEEVENTO",
    "BANCOMOVIMIENTO",
    "CUENTACORRIENTE",
    "CAJAMOVIMIENTO",
    "CAJASALDO",
    "CAJAMOVIMIENTOAFECTACION",
    "NUMERACION",
    "AUDITORIA",
    "SOLICITUD",
  ];
  const untouched = ["CAJAMOVIMIENTO", "CAJASALDO", "TRANSFERENCIA"];
  const nextNumber = async () =>
    String(
      (
        await rows("SELECT ProximoNumero FROM NUMERACION WHERE Codigo='RJ_N'")
      )[0]!.ProximoNumero,
    );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    values,
    currentAccount: cc,
    cashMovement: cash,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const login = async (role: string) => {
    const r = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({
        email: role + "-rejection@example.invalid",
        password,
      }),
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      session: (await r.json()) as SessionResponse,
    };
  };
  const admin = await login("ADMIN"),
    reader = await login("RJ_READ");
  const post = async (
    id: string,
    data: unknown,
    as = admin,
    extra: Record<string, string> = {},
  ) => {
    const preview = await values.rejectionPreview(id);
    return fetch(base + `/valores/CHEQUE/${id}/rechazar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": as.session.csrfToken,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${preview.version}"`,
        Cookie: as.cookie,
        ...extra,
      },
      body: JSON.stringify(data),
    });
  };
  await t.test(
    "contrato y permisos: cuenta, cliente e importe se derivan del cheque; sesión/ADMIN/CSRF/versión obligatorios",
    async () => {
      const id = mixed.ids[0]!,
        data = baseInput(),
        before = await snapshot(tables);
      assert.equal((await post(id, data, admin, { Cookie: "" })).status, 401);
      assert.equal((await post(id, data, reader)).status, 403);
      assert.equal(
        (await post(id, data, admin, { "X-CSRF-Token": "" })).status,
        403,
      );
      assert.equal(
        (await post(id, data, admin, { "If-Match": "" })).status,
        400,
      );
      assert.equal(
        (await post(id, data, admin, { "Idempotency-Key": "invalid" })).status,
        400,
      );
      for (const invalid of [
        { ...data, Cliente: "Otro" },
        { ...data, Importe: "1.00" },
        { ...data, BancoCuenta: "Otra" },
        { ...data, Motivo: "" },
        { ...data, Fecha: "2026-02-31" },
        { ...data, NumeroAutomatico: false, NumeroComprobante: "0" },
      ])
        assert.equal((await post(id, invalid)).status, 400);
      await assert.rejects(
        values.rejectionPreview(portfolio.ids[0]!),
        /depositados o acreditados/,
      );
      await assert.rejects(
        reject(id, { ...data, Comprobante: "RJ_OUT" }),
        /comprobante activo/,
      );
      await assert.rejects(
        reject(id, { ...data, Fecha: "2026-10-26" }),
        /anterior/,
      );
      await assert.rejects(
        reject(id, {
          ...data,
          ConfirmarDebitoBancario: true,
          FechaDebito: "2026-10-31",
        }),
        /sin acreditar/,
      );
      assert.deepEqual(await snapshot(tables), before);
    },
  );
  await t.test(
    "rechazo de un cheque de cobro mixto recupera solo su importe sin tocar Recibo, efectivo, cierres o afectaciones originales",
    async () => {
      const id = mixed.ids[0]!,
        before = await snapshot(untouched),
        old = await rows(
          "SELECT * FROM CAJAMOVIMIENTOAFECTACION WHERE CajaMovimiento=?",
          [mixed.received.registro.IDTabla],
        );
      const r = await post(id, baseInput());
      assert.equal(r.status, 200, await r.clone().text());
      const result = (await r.json()) as ChequeRejectionResult;
      assert.equal(result.Importe, "60.00");
      assert.equal(result.Pendiente, "60.00");
      assert.equal(result.CompensadoACuenta, "0.00");
      assert.deepEqual(await snapshot(untouched), before);
      assert.deepEqual(
        await rows(
          "SELECT * FROM CAJAMOVIMIENTOAFECTACION WHERE CajaMovimiento=?",
          [mixed.received.registro.IDTabla],
        ),
        old,
      );
      const detail = await values.detail("CHEQUE", id);
      assert.equal(detail.registro.Estado, "RECHAZADO");
      assert.deepEqual(
        detail.historial.map((e) => e.Tipo),
        ["RECEPCION", "DEPOSITO", "RECHAZO"],
      );
      const event = detail.historial.at(-1)!;
      assert.equal(event.CuentaCorriente, result.CuentaCorriente);
      assert.equal(event.NumeroDeuda, result.NumeroDeuda);
      assert.equal(event.SentidoBancario, null);
      const debt = await cc.get(result.CuentaCorriente);
      assert.equal(debt.registro.Cuenta, "COBRAR");
      assert.equal(debt.registro.Naturaleza, "DEUDA");
      assert.equal(debt.registro.ChequeEvento, event.Clave);
      assert.equal(debt.registro.ChequeNumero, detail.registro.Numero);
      assert.equal(debt.registro.CajaMovimiento, null);
      assert.ok(
        (
          await cash.pending(
            pendingQuery.parse({
              Cliente: "RJ_C",
              Comprobante: "RJ_IN",
              limite: 100,
            }),
          )
        ).registros.some(
          (d) =>
            d.IDTabla === result.CuentaCorriente && d.Pendiente === "60.00",
        ),
      );
      const http = await fetch(
        base + `/cuenta-corriente/${result.CuentaCorriente}/anular`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ERP-Request": "1",
            "X-CSRF-Token": admin.session.csrfToken,
            "Idempotency-Key": randomUUID(),
            "If-Match": `"${debt.version}"`,
            Cookie: admin.cookie,
          },
          body: JSON.stringify({ Motivo: "No debe permitirse" }),
        },
      );
      assert.equal(http.status, 409);
      await assert.rejects(
        pool.execute(
          "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,ChequeEvento,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('RJ_C','RJ_RECH',?,'2026-10-31','COBRAR','DEUDA',60,'CONFIRMADO',?,?)",
          [event.Clave, user, new Date()],
        ),
      );
    },
  );
  await t.test(
    "acreditado exige débito real y genera egreso compensatorio sin borrar el ingreso anterior",
    async () => {
      const id = credited.ids[0]!,
        before = await snapshot(tables);
      await assert.rejects(reject(id), /Confirmá que el banco/);
      await assert.rejects(
        reject(id, { ...baseInput(true), FechaDebito: "2026-10-27" }),
        /anterior a la acreditación/,
      );
      assert.deepEqual(await snapshot(tables), before);
      const r = await reject(id, {
        ...baseInput(true),
        FechaDebito: "2026-10-30",
      });
      assert.equal(r.Importe, "150000.00");
      const bank = await rows(
        `SELECT bm.Sentido,bm.Importe,DATE_FORMAT(bm.Fecha,'%Y-%m-%d') AS Dia,(${effectiveBankMovement}) AS Vigente FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=? ORDER BY bm.IDTabla`,
        [id],
      );
      assert.deepEqual(
        bank.map((b) => [b.Sentido, b.Importe]),
        [
          ["INGRESO", "150000.00"],
          ["EGRESO", "150000.00"],
        ],
      );
      assert.ok(bank.every((b) => Number(b.Vigente) === 1));
      const last = (await values.detail("CHEQUE", id)).historial.at(-1)!;
      assert.equal(last.SentidoBancario, "EGRESO");
      assert.equal(last.ImporteBancario, "150000.00");
      assert.equal(last.Fecha, "2026-10-31");
      assert.equal(last.FechaBancaria, "2026-10-30");
      assert.equal(last.CajaMovimiento, null);
      assert.equal(last.CuentaCorriente, r.CuentaCorriente);
    },
  );
  await t.test(
    "compensa el anticipo disponible y no deja crédito ficticio; deuda bruta y pendiente se distinguen",
    async () => {
      const r = await reject(advance.ids[0]!);
      assert.equal(r.Importe, "100.00");
      assert.equal(r.CompensadoACuenta, "20.00");
      assert.equal(r.Pendiente, "80.00");
      const source = await cash.get(advance.received.registro.IDTabla);
      assert.equal(source.registro.ImporteACuenta, "20.00");
      assert.equal(source.registro.DisponibleACuenta, "0.00");
      assert.ok(
        source.afectaciones.some(
          (a) => a.CuentaCorriente === advance.debt && a.Importe === "80.00",
        ),
      );
      assert.equal(
        (await values.detail("CHEQUE", advance.ids[0]!)).historial.at(-1)!
          .CompensadoACuenta,
        "20.00",
      );
      const all = await reject(onlyAdvance.ids[0]!);
      assert.equal(all.CompensadoACuenta, "50.00");
      assert.equal(all.Pendiente, "0.00");
    },
  );
  await t.test(
    "dos cheques del mismo Recibo comparten el remanente sin consumirlo dos veces; versión detecta cambios",
    async () => {
      const a = pair.ids[0]!,
        b = pair.ids[1]!,
        old = (await values.rejectionPreview(b)).version;
      const first = await reject(a);
      assert.equal(first.CompensadoACuenta, "20.00");
      assert.equal(first.Pendiente, "20.00");
      const next = await nextNumber();
      await assert.rejects(reject(b, baseInput(), old), /cambiaron/);
      assert.equal(await nextNumber(), next);
      const second = await reject(b);
      assert.equal(second.CompensadoACuenta, "0.00");
      assert.equal(second.Pendiente, "60.00");
    },
  );
  await t.test(
    "concurrencia e idempotencia: un evento, una deuda, un avance; reintentar devuelve el resultado confirmado",
    async () => {
      const id = concurrent.ids[0]!,
        version = (await values.rejectionPreview(id)).version,
        key = randomUUID(),
        input = baseInput();
      const [a, b] = await Promise.all([
        reject(id, input, version, key),
        reject(id, input, version, key),
      ]);
      assert.deepEqual(a, b);
      await assert.rejects(
        reject(id, { ...input, Motivo: "Otro motivo" }, version, key),
        /otros datos/,
      );
      await assert.rejects(
        reject(id, input, version, randomUUID()),
        /depositados o acreditados/,
      );
      assert.equal(
        (
          await rows(
            "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='RECHAZO'",
            [id],
          )
        ).length,
        1,
      );
      assert.equal(
        (
          await rows(
            "SELECT IDTabla FROM CUENTACORRIENTE WHERE ChequeEvento=(SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='RECHAZO')",
            [id],
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "dos solicitudes independientes simultáneas solo generan un rechazo y no consumen números del intento rechazado",
    async () => {
      const id = race.ids[0]!,
        input = baseInput(),
        version = (await values.rejectionPreview(id)).version,
        before = BigInt(await nextNumber());
      const attempts = await Promise.allSettled([
        reject(id, input, version, randomUUID()),
        reject(id, input, version, randomUUID()),
      ]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(BigInt(await nextNumber()), before + 1n);
      assert.equal(
        (
          await rows(
            "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='RECHAZO'",
            [id],
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "rollback revierte numeración, evento, deuda, banco, aplicación y auditoría tras un fallo tardío",
    async () => {
      const id = rollback.ids[0]!,
        version = (await values.rejectionPreview(id)).version,
        key = randomUUID(),
        before = await snapshot(tables);
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_RJ_TEST");
      try {
        await assert.rejects(reject(id, baseInput(true), version, key));
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_RJ_TEST TO AUDITORIA");
      }
      assert.deepEqual(await snapshot(tables), before);
      await reject(id, baseInput(true), version, key);
    },
  );
  await t.test(
    "manual sin Numerador y cuenta/cliente derivados; lectores consultan trazabilidad y no hay eventos eliminados",
    async () => {
      const r = await reject(manual.ids[0]!, {
        ...baseInput(),
        Comprobante: "RJ_MANUAL",
        NumeroAutomatico: false,
        NumeroComprobante: "500000001",
      });
      assert.equal(r.NumeroDeuda, "0005-00000001");
      const list = await cc.list({
        Cliente: "RJ_C",
        q: "",
        Estado: "CONFIRMADO",
        pagina: 1,
        limite: 100,
      });
      assert.ok(list.registros.some((d) => d.IDTabla === r.CuentaCorriente));
      const response = await fetch(base + `/valores/CHEQUE/${manual.ids[0]}`, {
        headers: { Cookie: reader.cookie },
      });
      assert.equal(response.status, 200);
      const d = (await response.json()) as { historial: { Tipo: string }[] };
      assert.deepEqual(
        d.historial.map((e) => e.Tipo),
        ["RECEPCION", "DEPOSITO", "RECHAZO"],
      );
      const vals = await values.list(
        valueQuery.parse({ Estado: "RECHAZADO", BancoCuenta: "RJ_ACC" }),
      );
      assert.ok(vals.total >= 7);
    },
  );
  await t.test(
    "endosados quedan fuera de alcance; recuperar un Pago anulado permite luego depositar y rechazar con su historia completa",
    async () => {
      const current = await cash.open(
        { Caja: "RJ_BOX", SaldoInicial: "0.00" },
        user,
        randomUUID(),
      );
      const id = portfolio.ids[0]!;
      const paid = await cash.create(
        {
          Comprobante: "RJ_OUT",
          NumeroComprobante: (n++).toString(),
          NumeroAutomatico: false,
          Cliente: "RJ_C",
          FechaOrigen: "2026-10-26",
          CajaSaldo: current.IDTabla,
          Concepto: null,
          ImporteEfectivo: "0.00",
          ImporteACuenta: "30.00",
          Observacion: null,
          Afectaciones: [],
          Valores: [{ Tipo: "CARTERA", Cheque: id }],
        },
        user,
        randomUUID(),
      );
      await assert.rejects(
        values.rejectionPreview(id),
        /depositados o acreditados/,
      );
      await cash.annul(
        paid.registro.IDTabla,
        {
          CajaSaldo: current.IDTabla,
          Motivo: "Recuperar cheque de prueba",
          ConfirmarCorreccionBancaria: false,
        },
        paid.version,
        user,
        randomUUID(),
      );
      await cash.close(
        current.IDTabla,
        { SaldoContado: "0.00", Observacion: null },
        user,
        randomUUID(),
      );
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date());
      const date = today > "2026-10-31" ? today : "2026-10-31";
      await values.deposit(
        chequeDeposit.parse({
          Cheques: [id],
          BancoCuenta: "RJ_ACC",
          Fecha: date,
          Observacion: null,
        }),
        user,
        randomUUID(),
      );
      await reject(id, { ...baseInput(), Fecha: date });
      const detail = await values.detail("CHEQUE", id);
      assert.deepEqual(
        detail.historial.map((e) => e.Tipo),
        ["RECEPCION", "ENDOSO", "RECUPERACION", "DEPOSITO", "RECHAZO"],
      );
      assert.equal(
        detail.historial.find((e) => e.Tipo === "ENDOSO")!.EstadoOperacion,
        "ANULADO",
      );
    },
  );
});
