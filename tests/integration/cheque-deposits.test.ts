import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  SessionResponse,
  ValueList,
  ChequeDepositInput,
  ChequeDepositResult,
  ChequeAccreditationInput,
  ChequeAccreditationResult,
} from "@erp/shared";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createApp } from "../../apps/api/src/app.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { effectiveBankMovement } from "../../apps/api/src/database/bank-movements.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";
import {
  chequeDeposit,
  chequeAccreditation,
  valueQuery,
} from "../../apps/api/src/values/validation.js";

test("Valores: depósitos y acreditaciones, custodia y registro bancario", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  assert.equal(config.DB_HOST, "127.0.0.1");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  t.after(() => pool.end());
  const rows = async (sql: string, params: (string | number)[] = []) =>
    (await pool.execute<RowDataPacket[]>(sql, params))[0];
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('DP_READER','Consulta depósitos')",
  );
  const password = randomBytes(24).toString("hex"),
    hash = await hashPassword(password);
  for (const role of ["ADMIN", "DP_READER"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [role, role + "-deposits@example.invalid", hash, role, new Date()],
    );
  const user = String(
    (
      await rows(
        "SELECT IDTabla FROM USUARIO WHERE Email='ADMIN-deposits@example.invalid'",
      )
    )[0]!.IDTabla,
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('DP_T','Depósitos')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('DP_C','Cliente depósitos','DP_T')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('DP_BOX','Caja depósitos')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('DP_B','Banco librador'),('DP_B2','Banco de destino')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('DP_ACC','DP_B2','Cuenta destino','ERP'),('DP_OFF','DP_B2','Cuenta inactiva','ERP')",
  );
  await pool.query("UPDATE BANCOCUENTA SET Activo=0 WHERE Codigo='DP_OFF'");
  await pool.query(
    "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES ('DP_IN','Cobro depósitos','COBROSPAGOS','COBRAR','CREDITO','INGRESO'),('DP_OUT','Pago depósitos','COBROSPAGOS','PAGAR','CREDITO','EGRESO')",
  );
  const cash = createCashMovementStore(pool),
    values = createValuesStore(pool);
  const box = await cash.open(
    { Caja: "DP_BOX", SaldoInicial: "0.00" },
    user,
    randomUUID(),
  );
  let number = 700000001n;
  const input = (
    Valores: CashInput["Valores"],
    total: string,
    pay = false,
    opening = box.IDTabla,
  ): CashInput => ({
    Comprobante: pay ? "DP_OUT" : "DP_IN",
    NumeroComprobante: (number++).toString(),
    NumeroAutomatico: false,
    Cliente: "DP_C",
    CajaSaldo: opening,
    FechaOrigen: "2026-10-20",
    Concepto: null,
    ImporteEfectivo: "0.00",
    ImporteACuenta: total,
    Observacion: null,
    Afectaciones: [],
    Valores,
  });
  const receive = async (numero: string, importe = "10.00", propio = false) => {
    const movement = await cash.create(
      input(
        [
          {
            Tipo: propio ? "PROPIO" : "TERCERO",
            Banco: propio ? "DP_B2" : "DP_B",
            BancoCuenta: propio ? "DP_ACC" : null,
            CuentaLibradora: propio ? null : "DP001",
            Numero: numero,
            Librador: "Librador",
            Documento: null,
            Emision: "2026-10-19",
            Vencimiento: "2026-11-10",
            Importe: importe,
          },
        ],
        importe,
        propio,
      ),
      user,
      randomUUID(),
    );
    return { id: movement.valores[0]!.IDTabla, movement };
  };
  const fixtures = [];
  for (let i = 1; i <= 12; i++)
    fixtures.push(
      await receive(String(i), i === 1 ? "15.01" : i === 2 ? "2.03" : "10.00"),
    );
  const own = await receive("90", "10.00", true);
  const endorsed = fixtures[11]!;
  await cash.create(
    input([{ Tipo: "CARTERA", Cheque: endorsed.id }], "10.00", true),
    user,
    randomUUID(),
  );
  await cash.close(
    box.IDTabla,
    { SaldoContado: "0.00", Observacion: null },
    user,
    randomUUID(),
  );
  const payload = (...ids: string[]): ChequeDepositInput => ({
    Cheques: ids,
    BancoCuenta: "DP_ACC",
    Fecha: "2026-10-28",
    Observacion: "Depósito de prueba",
  });
  const deposit = (data: ChequeDepositInput, key = randomUUID()) =>
    values.deposit(chequeDeposit.parse(data), user, key);
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    values,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const login = async (role: string) => {
    const response = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({
        email: role + "-deposits@example.invalid",
        password,
      }),
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0]!,
      session: (await response.json()) as SessionResponse,
    };
  };
  const admin = await login("ADMIN"),
    reader = await login("DP_READER");
  const post = (
    data: unknown,
    as = admin,
    extra: Record<string, string> = {},
    action = "depositos",
  ) =>
    fetch(base + "/valores/" + action, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": as.session.csrfToken,
        Cookie: as.cookie,
        "Idempotency-Key": randomUUID(),
        ...extra,
      },
      body: JSON.stringify(data),
    });
  const unaffected = [
    "TRANSFERENCIA",
    "BANCOMOVIMIENTO",
    "CAJAMOVIMIENTO",
    "CAJASALDO",
    "CUENTACORRIENTE",
    "CAJAMOVIMIENTOAFECTACION",
    "NUMERACION",
  ];
  const snapshot = (tables: string[]) =>
    Promise.all(
      tables.map((table) => rows(`SELECT * FROM ${table} ORDER BY IDTabla`)),
    );

  await t.test(
    "exige sesión, ADMIN, CSRF y contrato válido sin aceptar importes/estados del cliente",
    async () => {
      const data = payload(fixtures[0]!.id);
      assert.equal((await post(data, admin, { Cookie: "" })).status, 401);
      assert.equal((await post(data, reader)).status, 403);
      assert.equal(
        (await post(data, admin, { "X-CSRF-Token": "" })).status,
        403,
      );
      assert.equal(
        (await post(data, admin, { "X-ERP-Request": "" })).status,
        403,
      );
      assert.equal(
        (await post(data, admin, { "Idempotency-Key": "invalid" })).status,
        400,
      );
      for (const invalid of [
        { ...data, Cheques: [] },
        { ...data, Cheques: ["0"] },
        { ...data, Cheques: ["9223372036854775808"] },
        { ...data, Cheques: [fixtures[0]!.id, fixtures[0]!.id] },
        {
          ...data,
          Cheques: Array.from({ length: 101 }, (_, i) => String(i + 1)),
        },
        { ...data, Fecha: "2026-02-31" },
        { ...data, Importe: "1" },
        { ...data, CajaSaldo: box.IDTabla },
        { ...data, Estado: "CARTERA" },
      ])
        assert.equal((await post(invalid)).status, 400);
    },
  );
  await t.test(
    "rechaza cuenta/banco inactivos, fechas anteriores y cheques no disponibles sin escrituras parciales",
    async () => {
      const tables = [
          ...unaffected,
          "CHEQUE",
          "CHEQUEEVENTO",
          "AUDITORIA",
          "SOLICITUD",
        ],
        before = await snapshot(tables);
      for (const bad of [
        { ...payload(fixtures[0]!.id), BancoCuenta: "DP_OFF" },
        { ...payload(fixtures[0]!.id), BancoCuenta: "NO_EXISTE" },
        { ...payload(fixtures[0]!.id), Fecha: "2026-10-18" },
        { ...payload(fixtures[0]!.id), Fecha: "2026-10-19" },
        payload(fixtures[0]!.id, own.id),
        payload(fixtures[0]!.id, endorsed.id),
        payload(fixtures[0]!.id, "9223372036854775807"),
      ])
        await assert.rejects(deposit(bad));
      assert.deepEqual(await snapshot(tables), before);
      await pool.query("UPDATE BANCO SET Activo=0 WHERE Codigo='DP_B2'");
      await assert.rejects(deposit(payload(fixtures[0]!.id)), /activos/);
      await pool.query("UPDATE BANCO SET Activo=1 WHERE Codigo='DP_B2'");
    },
  );
  await t.test(
    "depósito por lote sin caja abierta; historial/cuenta de destino sin acreditar ni cambiar la cuenta libradora",
    async () => {
      const before = await snapshot(unaffected),
        key = randomUUID(),
        data = payload(fixtures[1]!.id, fixtures[0]!.id);
      const response = await post(data, admin, { "Idempotency-Key": key });
      assert.equal(response.status, 200, await response.clone().text());
      const result = (await response.json()) as ChequeDepositResult;
      assert.equal(result.ImporteTotal, "17.04");
      assert.deepEqual(await snapshot(unaffected), before);
      assert.deepEqual(
        await deposit({ ...data, Cheques: [...data.Cheques].reverse() }, key),
        result,
        "El mismo lote reordenado es un reintento",
      );
      await assert.rejects(
        deposit({ ...data, Observacion: "Otra solicitud" }, key),
        /otros datos/,
      );
      for (const id of data.Cheques) {
        const detail = await values.detail("CHEQUE", id);
        assert.equal(detail.registro.Estado, "DEPOSITADO");
        assert.equal(detail.registro.BancoCuenta, "DP_ACC");
        assert.equal(detail.registro.CuentaNombre, "Cuenta destino");
        assert.equal(
          detail.registro.Banco,
          "DP_B",
          "Conserva el banco librador",
        );
        assert.deepEqual(
          detail.historial.map((e) => e.Tipo),
          ["RECEPCION", "DEPOSITO"],
        );
        assert.equal(detail.historial.at(-1)!.CajaMovimiento, null);
        assert.equal(detail.historial.at(-1)!.Fecha, "2026-10-28");
        assert.equal(detail.historial.at(-1)!.CuentaNombre, "Cuenta destino");
        assert.equal(
          detail.historial.at(-1)!.Observacion,
          "Depósito de prueba",
        );
        const stored = (
          await rows("SELECT BancoCuenta FROM CHEQUE WHERE IDTabla=?", [id])
        )[0]!;
        assert.equal(stored.BancoCuenta, null);
        assert.equal(
          (
            await rows(
              "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='DEPOSITO'",
              [id],
            )
          ).length,
          1,
        );
        assert.equal(
          (
            await rows(
              "SELECT IDTabla FROM AUDITORIA WHERE Tabla='CHEQUE' AND Registro=? AND Accion='DEPOSITO'",
              [id],
            )
          ).length,
          1,
        );
      }
      const list = await values.list(
        valueQuery.parse({ Estado: "DEPOSITADO", BancoCuenta: "DP_ACC" }),
      );
      assert.equal(list.total, 2);
      assert.equal(
        (
          await cash.portfolio({
            q: "",
            Estado: "TODOS",
            pagina: 1,
            limite: 100,
          })
        ).registros.some((r) => data.Cheques.includes(r.IDTabla)),
        false,
      );
      const httpList = await fetch(
        base + "/valores?Estado=DEPOSITADO&BancoCuenta=DP_ACC",
        { headers: { Cookie: reader.cookie } },
      );
      assert.equal(((await httpList.json()) as ValueList).total, 2);
    },
  );
  await t.test(
    "un cheque depositado no puede volverse a depositar y el lote inválido se revierte completo",
    async () => {
      const before = await snapshot([
        "CHEQUE",
        "CHEQUEEVENTO",
        "AUDITORIA",
        "SOLICITUD",
      ]);
      assert.equal(
        (await post(payload(fixtures[0]!.id, fixtures[2]!.id))).status,
        409,
      );
      assert.deepEqual(
        await snapshot(["CHEQUE", "CHEQUEEVENTO", "AUDITORIA", "SOLICITUD"]),
        before,
      );
    },
  );
  await t.test(
    "fallo de auditoría revierte estado, eventos y clave de reintento de todo el lote",
    async () => {
      const data = payload(fixtures[2]!.id, fixtures[3]!.id),
        key = randomUUID();
      const tables = ["CHEQUE", "CHEQUEEVENTO", "AUDITORIA", "SOLICITUD"],
        before = await snapshot(tables);
      // Falla después de insertar evento y cambiar el estado, sin exigir
      // privilegios SUPER/creación de triggers en MySQL con binlog activo.
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_DP_TEST");
      try {
        await assert.rejects(deposit(data, key));
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_DP_TEST TO AUDITORIA");
      }
      assert.deepEqual(await snapshot(tables), before);
      await deposit(data, key);
    },
  );
  await t.test(
    "dos depósitos simultáneos no utilizan dos veces el mismo cheque",
    async () => {
      const id = fixtures[4]!.id;
      const results = await Promise.allSettled([
        deposit(payload(id)),
        deposit(payload(id)),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await rows(
            "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='DEPOSITO'",
            [id],
          )
        ).length,
        1,
      );
      const retryKey = randomUUID(),
        data = payload(fixtures[5]!.id);
      const [a, b] = await Promise.all([
        deposit(data, retryKey),
        deposit(data, retryKey),
      ]);
      assert.deepEqual(a, b);
    },
  );
  await t.test(
    "lotes simultáneos superpuestos confirman uno completo y no consumen cheques del lote rechazado",
    async () => {
      const a = fixtures[6]!.id,
        common = fixtures[7]!.id,
        b = fixtures[8]!.id;
      const result = await Promise.allSettled([
        deposit(payload(a, common)),
        deposit(payload(common, b)),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      const states = await rows(
        "SELECT Estado FROM CHEQUE WHERE IDTabla IN (?,?,?)",
        [a, common, b],
      );
      assert.equal(states.filter((r) => r.Estado === "DEPOSITADO").length, 2);
      assert.equal(states.filter((r) => r.Estado === "CARTERA").length, 1);
    },
  );
  await t.test(
    "depósito y endoso simultáneos se excluyen; el cobro de un cheque depositado conserva sus restricciones de corrección",
    async () => {
      const current = await cash.open(
        { Caja: "DP_BOX", SaldoInicial: "0.00" },
        user,
        randomUUID(),
      );
      const id = fixtures[9]!.id;
      const results = await Promise.allSettled([
        deposit(payload(id)),
        cash.create(
          input(
            [{ Tipo: "CARTERA", Cheque: id }],
            "10.00",
            true,
            current.IDTabla,
          ),
          user,
          randomUUID(),
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const events = await rows(
        "SELECT Tipo FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo IN ('DEPOSITO','ENDOSO')",
        [id],
      );
      assert.equal(events.length, 1);
      await assert.rejects(
        cash.create(
          input(
            [{ Tipo: "CARTERA", Cheque: fixtures[0]!.id }],
            "15.01",
            true,
            current.IDTabla,
          ),
          user,
          randomUUID(),
        ),
        /cartera/,
      );
      await cash.close(
        current.IDTabla,
        { SaldoContado: "0.00", Observacion: null },
        user,
        randomUUID(),
      );
      const next = await cash.open(
        { Caja: "DP_BOX", SaldoInicial: "0.00" },
        user,
        randomUUID(),
      );
      // Asociar reverso para que la validación alcance los eventos posteriores.
      await pool.query(
        "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('DP_REV_N',700000100)",
      );
      await pool.query(
        "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos,EsReversion,Numerador) VALUES ('DP_REV','Reverso cobro','COBROSPAGOS','COBRAR','DEUDA','EGRESO',1,'DP_REV_N')",
      );
      await pool.query(
        "UPDATE COMPROBANTE SET ComprobanteReversion='DP_REV' WHERE Codigo='DP_IN'",
      );
      const original = await cash.get(fixtures[0]!.movement.registro.IDTabla);
      await assert.rejects(
        cash.reverse(
          original.registro.IDTabla,
          { CajaSaldo: next.IDTabla, Motivo: "Corrección" },
          original.version,
          user,
          randomUUID(),
        ),
        /eventos posteriores/,
      );
      const newReceipt = await cash.create(
        input(
          [
            {
              Tipo: "TERCERO",
              Banco: "DP_B",
              BancoCuenta: null,
              CuentaLibradora: "DP001",
              Numero: "99",
              Librador: null,
              Documento: null,
              Emision: "2026-10-19",
              Vencimiento: "2026-11-10",
              Importe: "10.00",
            },
          ],
          "10.00",
          false,
          next.IDTabla,
        ),
        user,
        randomUUID(),
      );
      await deposit(payload(newReceipt.valores[0]!.IDTabla));
      const d = await cash.get(newReceipt.registro.IDTabla);
      await assert.rejects(
        cash.annul(
          d.registro.IDTabla,
          {
            CajaSaldo: next.IDTabla,
            Motivo: "Corrección",
            ConfirmarCorreccionBancaria: false,
          },
          d.version,
          user,
          randomUUID(),
        ),
        /cambios posteriores/,
      );
    },
  );
  // La acreditación continúa el circuito real: recepción → depósito → banco.
  const creditInput = (...ids: string[]): ChequeAccreditationInput => ({
    Cheques: ids,
    Fecha: "2026-10-31",
    Observacion: "Acreditación confirmada en el banco",
  });
  const accredit = (data: ChequeAccreditationInput, key = randomUUID()) =>
    values.accredit(chequeAccreditation.parse(data), user, key);
  const postCredit = (
    data: unknown,
    as = admin,
    headers: Record<string, string> = {},
  ) => post(data, as, headers, "acreditaciones");
  const creditUnchanged = unaffected.filter(
    (table) => table !== "BANCOMOVIMIENTO",
  );
  const allCreditTables = [
    ...unaffected,
    "CHEQUE",
    "CHEQUEEVENTO",
    "AUDITORIA",
    "SOLICITUD",
  ];

  await t.test(
    "acreditación exige ADMIN, CSRF, idempotencia y contrato sin cuenta ni importes editables",
    async () => {
      const data = creditInput(fixtures[0]!.id);
      const before = await snapshot(allCreditTables);
      assert.equal((await postCredit(data, admin, { Cookie: "" })).status, 401);
      assert.equal((await postCredit(data, reader)).status, 403);
      assert.equal(
        (await postCredit(data, admin, { "X-CSRF-Token": "" })).status,
        403,
      );
      assert.equal(
        (await postCredit(data, admin, { "X-ERP-Request": "" })).status,
        403,
      );
      assert.equal(
        (await postCredit(data, admin, { "Idempotency-Key": "malformed" }))
          .status,
        400,
      );
      for (const invalid of [
        { ...data, Cheques: [] },
        { ...data, Cheques: ["0"] },
        { ...data, Cheques: ["9223372036854775808"] },
        { ...data, Cheques: [fixtures[0]!.id, fixtures[0]!.id] },
        {
          ...data,
          Cheques: Array.from({ length: 101 }, (_, i) => String(i + 1)),
        },
        { ...data, Fecha: "2026-02-31" },
        { ...data, BancoCuenta: "DP_OFF" },
        { ...data, Importe: "0.01" },
        { ...data, CajaSaldo: box.IDTabla },
        { ...data, Estado: "ACREDITADO" },
      ])
        assert.equal((await postCredit(invalid)).status, 400);
      assert.deepEqual(await snapshot(allCreditTables), before);
    },
  );
  await t.test(
    "rechaza cartera, propios, endosados, fechas anteriores y cuentas/bancos inactivos sin efectos parciales",
    async () => {
      const before = await snapshot(allCreditTables);
      for (const invalid of [
        creditInput(fixtures[0]!.id, own.id),
        creditInput(fixtures[0]!.id, endorsed.id),
        creditInput(fixtures[0]!.id, fixtures[10]!.id),
        creditInput(fixtures[0]!.id, "9223372036854775807"),
        { ...creditInput(fixtures[0]!.id), Fecha: "2026-10-27" },
      ])
        await assert.rejects(accredit(invalid));
      await pool.query("UPDATE BANCOCUENTA SET Activo=0 WHERE Codigo='DP_ACC'");
      try {
        await assert.rejects(accredit(creditInput(fixtures[0]!.id)), /activos/);
      } finally {
        await pool.query(
          "UPDATE BANCOCUENTA SET Activo=1 WHERE Codigo='DP_ACC'",
        );
      }
      await pool.query("UPDATE BANCO SET Activo=0 WHERE Codigo='DP_B2'");
      try {
        await assert.rejects(accredit(creditInput(fixtures[0]!.id)), /activos/);
      } finally {
        await pool.query("UPDATE BANCO SET Activo=1 WHERE Codigo='DP_B2'");
      }
      assert.deepEqual(await snapshot(allCreditTables), before);
    },
  );
  await t.test(
    "no acredita un depósito inconsistente ni un cheque que ya tenga asiento bancario",
    async () => {
      const id = fixtures[5]!.id,
        data = creditInput(id);
      const before = await snapshot(allCreditTables);
      await pool.execute(
        "UPDATE CHEQUEEVENTO SET BancoCuenta=NULL WHERE Cheque=? AND Tipo='DEPOSITO'",
        [id],
      );
      try {
        await assert.rejects(accredit(data), /depósito válido/);
      } finally {
        await pool.execute(
          "UPDATE CHEQUEEVENTO SET BancoCuenta='DP_ACC' WHERE Cheque=? AND Tipo='DEPOSITO'",
          [id],
        );
      }
      await pool.execute(
        "UPDATE CHEQUEEVENTO SET Tipo='PRUEBA' WHERE Cheque=? AND Tipo='DEPOSITO'",
        [id],
      );
      try {
        await assert.rejects(accredit(data), /depósito válido/);
      } finally {
        await pool.execute(
          "UPDATE CHEQUEEVENTO SET Tipo='DEPOSITO' WHERE Cheque=? AND Tipo='PRUEBA'",
          [id],
        );
      }
      await pool.execute(
        "INSERT INTO BANCOMOVIMIENTO (BancoCuenta,Fecha,Sentido,Importe,Origen,ChequeEvento,Usuario,CreadoEn) SELECT 'DP_ACC','2026-10-28','INGRESO','10.00','CHEQUE',IDTabla,?,? FROM CHEQUEEVENTO WHERE Cheque=? AND Tipo='DEPOSITO'",
        [user, new Date(), id],
      );
      try {
        await assert.rejects(accredit(data), /ya tiene movimientos bancarios/);
      } finally {
        await pool.execute(
          "DELETE bm FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=? AND e.Tipo='DEPOSITO'",
          [id],
        );
      }
      assert.deepEqual(await snapshot(allCreditTables), before);
    },
  );
  await t.test(
    "acredita un lote sin caja abierta, por el importe exacto en la cuenta del depósito y sin cambiar Cuenta corriente",
    async () => {
      const open = await rows(
        "SELECT IDTabla FROM CAJASALDO WHERE Caja='DP_BOX' AND Estado='ABIERTO'",
      );
      for (const row of open)
        await cash.close(
          String(row.IDTabla),
          { SaldoContado: "0.00", Observacion: null },
          user,
          randomUUID(),
        );
      const before = await snapshot(creditUnchanged),
        ids = [fixtures[1]!.id, fixtures[0]!.id],
        data = creditInput(...ids),
        key = randomUUID();
      const response = await postCredit(data, admin, {
        "Idempotency-Key": key,
      });
      assert.equal(response.status, 200, await response.clone().text());
      const result = (await response.json()) as ChequeAccreditationResult;
      assert.equal(result.ImporteTotal, "17.04");
      assert.deepEqual(await snapshot(creditUnchanged), before);
      assert.deepEqual(
        await accredit({ ...data, Cheques: [...ids].reverse() }, key),
        result,
      );
      await assert.rejects(
        accredit({ ...data, Observacion: "Datos distintos" }, key),
        /otros datos/,
      );
      for (const id of ids) {
        const detail = await values.detail("CHEQUE", id);
        assert.equal(detail.registro.Estado, "ACREDITADO");
        assert.equal(detail.registro.BancoCuenta, "DP_ACC");
        assert.deepEqual(
          detail.historial.map((e) => e.Tipo),
          ["RECEPCION", "DEPOSITO", "ACREDITACION"],
        );
        const last = detail.historial.at(-1)!;
        assert.equal(last.CuentaNombre, "Cuenta destino");
        assert.equal(last.Fecha, "2026-10-31");
        assert.equal(last.UsuarioNombre, "ADMIN");
        assert.equal(last.Observacion, data.Observacion);
        assert.equal(last.CajaMovimiento, null);
        assert.equal(last.SentidoBancario, "INGRESO");
        assert.equal(last.ImporteBancario, detail.registro.Importe);
        const bank = await rows(
          `SELECT bm.*,DATE_FORMAT(bm.Fecha,'%Y-%m-%d') AS Dia,(${effectiveBankMovement}) AS Vigente FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=?`,
          [id],
        );
        assert.equal(bank.length, 1);
        assert.equal(bank[0]!.ChequeEvento, last.Clave);
        assert.equal(bank[0]!.BancoCuenta, "DP_ACC");
        assert.equal(bank[0]!.Importe, detail.registro.Importe);
        assert.equal(bank[0]!.Sentido, "INGRESO");
        assert.equal(bank[0]!.Origen, "CHEQUE");
        assert.equal(bank[0]!.Dia, "2026-10-31");
        assert.equal(bank[0]!.Transferencia, null);
        assert.equal(Number(bank[0]!.Vigente), 1);
        assert.equal(
          (
            await rows("SELECT BancoCuenta FROM CHEQUE WHERE IDTabla=?", [id])
          )[0]!.BancoCuenta,
          null,
        );
        assert.equal(
          (
            await rows(
              "SELECT IDTabla FROM AUDITORIA WHERE Tabla='CHEQUE' AND Registro=? AND Accion='ACREDITACION'",
              [id],
            )
          ).length,
          1,
        );
      }
      const list = await values.list(
        valueQuery.parse({ Estado: "ACREDITADO", BancoCuenta: "DP_ACC" }),
      );
      assert.equal(list.total, 2);
      const read = await fetch(
        base + "/valores?Estado=ACREDITADO&BancoCuenta=DP_ACC",
        { headers: { Cookie: reader.cookie } },
      );
      assert.equal(read.status, 200);
      assert.equal(((await read.json()) as ValueList).total, 2);
      const after = await snapshot(allCreditTables);
      assert.equal(
        (await postCredit(creditInput(fixtures[0]!.id, fixtures[2]!.id)))
          .status,
        409,
      );
      assert.deepEqual(await snapshot(allCreditTables), after);
    },
  );
  await t.test(
    "fallo de auditoría revierte también el ingreso bancario y permite reintentar el mismo lote",
    async () => {
      const data = creditInput(fixtures[4]!.id, fixtures[5]!.id),
        key = randomUUID(),
        before = await snapshot(allCreditTables);
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_AC_TEST");
      try {
        await assert.rejects(accredit(data, key));
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_AC_TEST TO AUDITORIA");
      }
      assert.deepEqual(await snapshot(allCreditTables), before);
      await accredit(data, key);
    },
  );
  await t.test(
    "acreditaciones simultáneas y reintentos concurrentes generan un solo ingreso por cheque",
    async () => {
      const id = fixtures[2]!.id;
      const results = await Promise.allSettled([
        accredit(creditInput(id)),
        accredit(creditInput(id)),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const data = creditInput(fixtures[3]!.id),
        key = randomUUID();
      const [a, b] = await Promise.all([
        accredit(data, key),
        accredit(data, key),
      ]);
      assert.deepEqual(a, b);
      for (const cheque of [id, fixtures[3]!.id])
        assert.equal(
          (
            await rows(
              "SELECT bm.IDTabla FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=?",
              [cheque],
            )
          ).length,
          1,
        );
    },
  );
  await t.test(
    "un lote puede acreditar cheques en sus respectivas cuentas de depósito sin permitir cambiar destinos",
    async () => {
      await pool.query(
        "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('DP_ACC2','DP_B2','Otra cuenta destino','ERP')",
      );
      const second = fixtures[10]!.id;
      await deposit({ ...payload(second), BancoCuenta: "DP_ACC2" });
      // Una referencia histórica en el instrumento no reemplaza la cuenta
      // efectivamente registrada en el depósito ni se modifica al acreditar.
      await pool.execute(
        "UPDATE CHEQUE SET BancoCuenta='DP_ACC' WHERE IDTabla=?",
        [second],
      );
      assert.equal(
        (await values.detail("CHEQUE", second)).registro.BancoCuenta,
        "DP_ACC2",
      );
      const first = (
        await rows(
          "SELECT IDTabla FROM CHEQUE WHERE Estado='DEPOSITADO' AND IDTabla IN (?,?,?) ORDER BY IDTabla",
          fixtures.slice(6, 9).map((r) => r.id),
        )
      )[0]!.IDTabla as string;
      await accredit(creditInput(first, second));
      const bank = await rows(
        "SELECT e.Cheque,bm.BancoCuenta FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque IN (?,?) ORDER BY e.Cheque",
        [first, second],
      );
      assert.equal(bank.length, 2);
      assert.equal(
        bank.find((b) => String(b.Cheque) === first)!.BancoCuenta,
        "DP_ACC",
      );
      assert.equal(
        bank.find((b) => String(b.Cheque) === second)!.BancoCuenta,
        "DP_ACC2",
      );
      assert.equal(
        (await values.detail("CHEQUE", second)).registro.CuentaNombre,
        "Otra cuenta destino",
      );
      assert.equal(
        (
          await rows("SELECT BancoCuenta FROM CHEQUE WHERE IDTabla=?", [second])
        )[0]!.BancoCuenta,
        "DP_ACC",
      );
    },
  );
});
