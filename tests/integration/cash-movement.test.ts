import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  CashDetail,
  CashOptions,
  PendingList,
  CurrentAccountList,
  SessionResponse,
} from "@erp/shared";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createApp } from "../../apps/api/src/app.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
test("Cobros y pagos: valores, afectaciones y cierres reales en base aislada", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('CM_LECTOR','Consulta')",
  );
  const hash = await hashPassword(password);
  for (const role of ["ADMIN", "CM_LECTOR"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [role, role + "-cm@example.invalid", hash, role, new Date()],
    );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('CM_T','Jugador')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('CM_A','Jugador A','CM_T'),('CM_B','Jugador B','CM_T')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('CM_CAJA','Caja principal'),('CM_CAJA2','Caja secundaria')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('CM_BANCO','Banco de prueba')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('CM_CUENTA','CM_BANCO','Cuenta principal','ERP')",
  );
  for (const [code, account, nature, sense, module] of [
    ["CM_J", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["CM_PR", "PAGAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["CM_C", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["CM_P", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["CM_RC", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
    ["CM_RP", "PAGAR", "DEUDA", "INGRESO", "COBROSPAGOS"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, sense, module],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('CM_C',100000001),('CM_P',100000001),('CM_RC',100000001),('CM_RP',100000001)",
  );
  await pool.query(
    "UPDATE COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Codigo SET c.Numerador=n.Codigo WHERE c.Numerador IS NULL",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET EsReversion=1 WHERE Codigo IN ('CM_RC','CM_RP')",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='CM_RC' WHERE Codigo='CM_C'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='CM_RP' WHERE Codigo='CM_P'",
  );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    cashMovement: createCashMovementStore(pool),
    currentAccount: createCurrentAccountStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = "http://127.0.0.1:" + addr.port;
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });
  async function login(role: string) {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({ email: role + "-cm@example.invalid", password }),
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      session: (await r.json()) as SessionResponse,
    };
  }
  const admin = await login("ADMIN"),
    reader = await login("CM_LECTOR");
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    key = randomUUID(),
    version?: string,
    as = admin,
  ) {
    return fetch(base + "/api/caja-movimiento" + path, {
      method,
      headers: {
        Cookie: as.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": as.session.csrfToken,
        "Idempotency-Key": key,
        ...(version ? { "If-Match": '"' + version + '"' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function good<T>(r: Response, status = 200): Promise<T> {
    assert.equal(r.status, status, await r.clone().text());
    return (await r.json()) as T;
  }
  async function options() {
    return good<CashOptions>(await req("/opciones"));
  }
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  let box = "",
    number = 100000001n,
    prizeId = "",
    debtId = "",
    first: CashDetail,
    ownPayment: CashDetail,
    carteraId = "";
  const cashInput = (extra: Partial<CashInput> = {}): CashInput => ({
    Comprobante: "CM_C",
    NumeroComprobante: (number++).toString(),
    Cliente: "CM_A",
    FechaOrigen: date,
    CajaSaldo: box,
    Concepto: null,
    ImporteEfectivo: "0.00",
    ImporteACuenta: "0.00",
    Observacion: null,
    Afectaciones: [],
    Valores: [],
    ...extra,
  });
  async function debt(code: string, amount: string, client = "CM_A") {
    const r = await fetch(base + "/api/cuenta-corriente", {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": admin.session.csrfToken,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        Cliente: client,
        Comprobante: code,
        NumeroComprobante: (number++).toString(),
        FechaOrigen: "2026-01-01",
        Vencimiento: null,
        Importe: amount,
        Observacion: null,
      }),
    });
    return (await good<{ registro: { IDTabla: string } }>(r, 201)).registro
      .IDTabla;
  }
  async function pending(code = "CM_C") {
    return good<PendingList>(
      await req("/pendientes?Cliente=CM_A&Comprobante=" + code),
    );
  }
  async function create(input: CashInput, key = randomUUID()) {
    return good<CashDetail>(await req("", "POST", input, key), 201);
  }
  async function count(table: string) {
    const [r] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM " +
        table +
        " WHERE " +
        (table === "CAJAMOVIMIENTO" ? "Comprobante LIKE 'CM_%'" : "1=1"),
    );
    return Number(r[0]!.total);
  }
  const third = (numero: string, amount: string) => ({
    Tipo: "TERCERO" as const,
    Banco: "CM_BANCO",
    BancoCuenta: null,
    CuentaLibradora: "123-45",
    Numero: numero,
    Librador: "Emisor",
    Documento: "20111111112",
    Emision: date,
    Vencimiento: date,
    Importe: amount,
  });
  await t.test(
    "permisos, caja obligatoria y opciones sin consumir numeración",
    async () => {
      assert.equal((await fetch(base + "/api/caja-movimiento")).status, 401);
      assert.equal(
        (await req("", "POST", {}, randomUUID(), undefined, reader)).status,
        403,
      );
      const a = await options();
      assert.equal(a.aperturas.length, 0);
      assert.equal(
        a.numeradores.find((n) => n.Comprobante === "CM_C")!.ProximoNumero,
        "100000001",
      );
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              CajaSaldo: "999999",
              ImporteEfectivo: "10",
              ImporteACuenta: "10",
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (await req("/pendientes?Cliente=CM_A&Comprobante=CM_J")).status,
        400,
      );
      const attempts = await Promise.all([
        req("/cajas", "POST", { Caja: "CM_CAJA", SaldoInicial: "200.00" }),
        req("/cajas", "POST", { Caja: "CM_CAJA", SaldoInicial: "200.00" }),
      ]);
      assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
      box = (await options()).aperturas.find(
        (o) => o.Caja === "CM_CAJA",
      )!.IDTabla;
    },
  );
  await t.test(
    "cobro mixto y anticipo: cartera no acredita banco ni duplica cuenta corriente",
    async () => {
      debtId = await debt("CM_J", "80");
      prizeId = await debt("CM_PR", "70");
      const p = await pending();
      assert.ok(p.registros.some((r) => r.IDTabla === debtId));
      const body = cashInput({
        ImporteEfectivo: "20.00",
        ImporteACuenta: "20.00",
        Afectaciones: [{ CuentaCorriente: debtId, Importe: "80.00" }],
        Valores: [
          {
            Tipo: "TRANSFERENCIA",
            BancoCuenta: "CM_CUENTA",
            Importe: "40.00",
            Referencia: "T1",
          },
          third("00001234", "40.00"),
        ],
      });
      const key = randomUUID();
      first = await create(body, key);
      assert.equal(first.registro.ImporteTotal, "100.00");
      assert.equal(first.registro.DisponibleACuenta, "20.00");
      assert.equal(first.valores.length, 2);
      carteraId = first.valores.find((v) => v.Tipo === "TERCERO")!.IDTabla;
      assert.equal(
        (await create(body, key)).registro.IDTabla,
        first.registro.IDTabla,
      );
      assert.equal(
        (await req("", "POST", { ...body, Observacion: "Otro" }, key)).status,
        409,
      );
      const [o] = await pool.execute<RowDataPacket[]>(
        "SELECT Importe,Naturaleza FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
        [first.registro.IDTabla],
      );
      assert.equal(o.length, 1);
      assert.equal(o[0]!.Importe, "100.00");
      assert.equal(o[0]!.Naturaleza, "CREDITO");
      assert.equal(
        (await options()).aperturas.find((o) => o.IDTabla === box)!.SaldoActual,
        "220.00",
      );
      const [b] = await pool.execute<RowDataPacket[]>(
        "SELECT bm.Importe FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia WHERE t.CajaMovimiento=?",
        [first.registro.IDTabla],
      );
      assert.equal(b.length, 1);
      assert.equal(b[0]!.Importe, "40.00");
      assert.ok(!(await pending()).registros.some((r) => r.IDTabla === debtId));
    },
  );
  await t.test(
    "el listado de Cuenta corriente oculta asientos de caja sin cambiar saldos ni trazabilidad",
    async () => {
      const list = await good<CurrentAccountList>(
        await fetch(base + "/api/cuenta-corriente?Cliente=CM_A&Estado=TODOS", {
          headers: { Cookie: admin.cookie },
        }),
      );
      assert.ok(list.registros.some((r) => r.IDTabla === debtId));
      assert.ok(list.registros.some((r) => r.IDTabla === prizeId));
      assert.ok(list.registros.every((r) => r.CajaMovimiento === null));
      assert.equal(list.total, list.registros.length);
      assert.deepEqual(list.saldos, { Cobrar: "-20.00", Pagar: "70.00" });
      const search = await good<CurrentAccountList>(
        await fetch(base + "/api/cuenta-corriente?q=CM_C&Estado=TODOS", {
          headers: { Cookie: admin.cookie },
        }),
      );
      assert.ok(search.registros.every((r) => r.CajaMovimiento === null));
      const [credit] = await pool.execute<RowDataPacket[]>(
        "SELECT IDTabla FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
        [first.registro.IDTabla],
      );
      const d = await good<{ registro: { IDTabla: string } }>(
        await fetch(base + "/api/cuenta-corriente/" + credit[0]!.IDTabla, {
          headers: { Cookie: admin.cookie },
        }),
      );
      assert.equal(d.registro.IDTabla, String(credit[0]!.IDTabla));
      assert.equal(
        (await good<CashDetail>(await req("/" + first.registro.IDTabla)))
          .registro.DisponibleACuenta,
        "20.00",
      );
    },
  );
  await t.test(
    "la exclusión de afectaciones en borrador respeta filtros, totales y paginación sin alterar pendientes",
    async () => {
      const ids = [];
      for (let i = 0; i < 23; i++) ids.push(await debt("CM_J", "100", "CM_B"));
      const list = (exclude = "", page = 1, search = "") =>
        req(
          "/pendientes?" +
            new URLSearchParams({
              Cliente: "CM_B",
              Comprobante: "CM_C",
              Excluir: exclude,
              pagina: String(page),
              q: search,
            }),
        );
      const before = await good<PendingList>(await list());
      assert.equal(before.total, 23);
      const exclude = ids.slice(0, 4).join(",");
      const filtered = await good<PendingList>(await list(exclude));
      assert.equal(filtered.total, 19);
      assert.equal(filtered.registros.length, 19);
      assert.ok(
        filtered.registros.every((r) => !ids.slice(0, 4).includes(r.IDTabla)),
      );
      const second = await good<PendingList>(await list(ids[0], 2));
      assert.equal(second.total, 22);
      assert.equal(second.registros.length, 2);
      const search = await good<PendingList>(await list(exclude, 1, "CM_J"));
      assert.equal(search.total, 19);
      const restored = await good<PendingList>(await list());
      assert.equal(restored.total, 23);
      assert.ok(restored.registros.every((r) => r.Pendiente === "100.00"));
      assert.equal((await list("1) OR 1=1")).status, 400);
      assert.equal((await list(Array(101).fill(ids[0]).join(","))).status, 400);
    },
  );
  await t.test(
    "diagnóstico Pago/Premio: Crédito cancela deuda por pagar y los pendientes usan los datos guardados del premio",
    async () => {
      const list = await pending("CM_P");
      assert.equal(list.total, 1);
      assert.equal(list.registros[0]!.IDTabla, prizeId);
      assert.equal(list.registros[0]!.Pendiente, "70.00");
      assert.ok(
        !(await pending("CM_C")).registros.some((r) => r.IDTabla === prizeId),
      );
      const excluded = await good<PendingList>(
        await req(
          "/pendientes?Cliente=CM_A&Comprobante=CM_P&Excluir=" + prizeId,
        ),
      );
      assert.equal(excluded.total, 0);
      assert.equal((await pending("CM_P")).registros[0]!.Pendiente, "70.00");
      const otherClient = await good<PendingList>(
        await req("/pendientes?Cliente=CM_B&Comprobante=CM_P"),
      );
      assert.equal(otherClient.total, 0);
      const [original] = await pool.execute<RowDataPacket[]>(
        "SELECT Cuenta,Naturaleza,Estado FROM CUENTACORRIENTE WHERE IDTabla=?",
        [prizeId],
      );
      assert.deepEqual(
        { ...original[0] },
        { Cuenta: "PAGAR", Naturaleza: "DEUDA", Estado: "CONFIRMADO" },
      );
      try {
        // No hay reinterpretación histórica al editar el maestro del comprobante.
        await pool.query(
          "UPDATE COMPROBANTE SET Cuenta='COBRAR',Naturaleza='CREDITO' WHERE Codigo='CM_PR'",
        );
        assert.equal((await pending("CM_P")).registros[0]!.IDTabla, prizeId);
        await pool.query(
          "UPDATE COMPROBANTE SET Naturaleza='DEUDA' WHERE Codigo='CM_P'",
        );
        assert.equal(
          (await req("/pendientes?Cliente=CM_A&Comprobante=CM_P")).status,
          400,
        );
      } finally {
        await pool.query(
          "UPDATE COMPROBANTE SET Cuenta='PAGAR',Naturaleza='DEUDA' WHERE Codigo='CM_PR'",
        );
        await pool.query(
          "UPDATE COMPROBANTE SET Naturaleza='CREDITO' WHERE Codigo='CM_P'",
        );
      }
      for (const [field, invalid] of [
        ["Cuenta", "COBRAR"],
        ["Naturaleza", "CREDITO"],
        ["Estado", "ANULADO"],
      ]) {
        try {
          // Reproduce, solo en la base efímera, los motivos reales de exclusión.
          await pool.execute(
            `UPDATE CUENTACORRIENTE SET ${field}=? WHERE IDTabla=?`,
            [invalid, prizeId],
          );
          assert.equal((await pending("CM_P")).total, 0);
        } finally {
          await pool.execute(
            `UPDATE CUENTACORRIENTE SET ${field}=? WHERE IDTabla=?`,
            [original[0]![field!], prizeId],
          );
        }
      }
      assert.equal((await pending("CM_P")).registros[0]!.Pendiente, "70.00");
    },
  );
  await t.test(
    "pago con cartera y afectación parcial; rechazo de duplicados y tipos incompatibles",
    async () => {
      const payment = await create(
        cashInput({
          Comprobante: "CM_P",
          ImporteEfectivo: "10.00",
          Afectaciones: [{ CuentaCorriente: prizeId, Importe: "50.00" }],
          Valores: [{ Tipo: "CARTERA", Cheque: carteraId }],
        }),
      );
      assert.equal(payment.registro.ImporteTotal, "50.00");
      assert.equal(payment.registro.Cuenta, "PAGAR");
      assert.equal(payment.registro.Sentido, "EGRESO");
      const [credit] = await pool.execute<RowDataPacket[]>(
        "SELECT Cuenta,Naturaleza,Importe FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
        [payment.registro.IDTabla],
      );
      assert.equal(credit.length, 1);
      assert.deepEqual(
        { ...credit[0] },
        { Cuenta: "PAGAR", Naturaleza: "CREDITO", Importe: "50.00" },
      );
      const balances = await good<CurrentAccountList>(
        await fetch(base + "/api/cuenta-corriente?Cliente=CM_A&Estado=TODOS", {
          headers: { Cookie: admin.cookie },
        }),
      );
      assert.equal(
        balances.saldos!.Pagar,
        "20.00",
        "El pago resta una sola vez del saldo",
      );
      assert.equal(
        (await pending("CM_P")).registros.find((r) => r.IDTabla === prizeId)!
          .Pendiente,
        "20.00",
      );
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              Comprobante: "CM_P",
              ImporteACuenta: "40.00",
              Valores: [{ Tipo: "CARTERA", Cheque: carteraId }],
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              ImporteACuenta: "40.00",
              Valores: [third("1234", "40.00")],
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              Comprobante: "CM_P",
              ImporteACuenta: "10.00",
              Valores: [third("9999", "10.00")],
            }),
          )
        ).status,
        400,
      );
      const before = await count("CAJAMOVIMIENTO");
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              ImporteEfectivo: "10",
              Afectaciones: [{ CuentaCorriente: prizeId, Importe: "10" }],
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({ ImporteEfectivo: "10", ImporteACuenta: "9" }),
          )
        ).status,
        400,
      );
      assert.equal(await count("CAJAMOVIMIENTO"), before);
    },
  );
  await t.test(
    "dos usuarios no consumen dos veces el mismo pendiente o cheque",
    async () => {
      const d = await debt("CM_J", "60");
      const a = await Promise.all([
        req(
          "",
          "POST",
          cashInput({
            ImporteEfectivo: "60",
            Afectaciones: [{ CuentaCorriente: d, Importe: "60" }],
          }),
        ),
        req(
          "",
          "POST",
          cashInput({
            ImporteEfectivo: "60",
            Afectaciones: [{ CuentaCorriente: d, Importe: "60" }],
          }),
        ),
      ]);
      assert.deepEqual(a.map((r) => r.status).sort(), [201, 409]);
      const receipt = await create(
        cashInput({ ImporteACuenta: "10", Valores: [third("7777", "10")] }),
      );
      const cheque = receipt.valores[0]!.IDTabla;
      const b = await Promise.all([
        req(
          "",
          "POST",
          cashInput({
            Comprobante: "CM_P",
            ImporteACuenta: "10",
            Valores: [{ Tipo: "CARTERA", Cheque: cheque }],
          }),
        ),
        req(
          "",
          "POST",
          cashInput({
            Comprobante: "CM_P",
            ImporteACuenta: "10",
            Valores: [{ Tipo: "CARTERA", Cheque: cheque }],
          }),
        ),
      ]);
      assert.deepEqual(b.map((r) => r.status).sort(), [201, 409]);
    },
  );
  await t.test(
    "emisión propia no debita banco; errores revierten valores, numerador y auditoría",
    async () => {
      ownPayment = await create(
        cashInput({
          Comprobante: "CM_P",
          ImporteACuenta: "25",
          Valores: [
            {
              Tipo: "PROPIO",
              Banco: "CM_BANCO",
              BancoCuenta: "CM_CUENTA",
              CuentaLibradora: null,
              Numero: "12345678",
              Librador: "ERP",
              Documento: null,
              Emision: date,
              Vencimiento: date,
              Importe: "25",
            },
          ],
        }),
      );
      assert.equal(ownPayment.valores[0]!.Estado, "EMITIDO");
      const [r] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM BANCOMOVIMIENTO b JOIN CHEQUEEVENTO e ON e.IDTabla=b.ChequeEvento WHERE e.CajaMovimiento=?",
        [ownPayment.registro.IDTabla],
      );
      assert.equal(Number(r[0]!.total), 0);
      const before = await count("CHEQUE");
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({
              ImporteACuenta: "20",
              Valores: [third("5555", "10"), third("05555", "10")],
            }),
          )
        ).status,
        400,
      );
      assert.equal(await count("CHEQUE"), before);
      const invalid = await req(
        "",
        "POST",
        cashInput({
          Comprobante: "CM_P",
          ImporteEfectivo: "99999",
          ImporteACuenta: "99999",
        }),
      );
      assert.equal(invalid.status, 409);
    },
  );
  await t.test(
    "un fallo al auditar revierte operación, instrumentos, afectaciones y numerador",
    async () => {
      const d = await debt("CM_J", "10");
      const input = cashInput({
        Afectaciones: [{ CuentaCorriente: d, Importe: "10" }],
        Valores: [
          {
            Tipo: "TRANSFERENCIA",
            BancoCuenta: "CM_CUENTA",
            Importe: "5",
            Referencia: "ROLLBACK",
          },
          third("90000000", "5"),
        ],
      });
      const key = randomUUID();
      const before = {
        cash: await count("CAJAMOVIMIENTO"),
        cheques: await count("CHEQUE"),
        bank: await count("BANCOMOVIMIENTO"),
        af: await count("CAJAMOVIMIENTOAFECTACION"),
      };
      const numbering = (await options()).numeradores.find(
        (n) => n.Comprobante === "CM_C",
      )!.ProximoNumero;
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_CM_TEST");
      try {
        assert.equal((await req("", "POST", input, key)).status, 500);
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_CM_TEST TO AUDITORIA");
      }
      assert.deepEqual(
        {
          cash: await count("CAJAMOVIMIENTO"),
          cheques: await count("CHEQUE"),
          bank: await count("BANCOMOVIMIENTO"),
          af: await count("CAJAMOVIMIENTOAFECTACION"),
        },
        before,
      );
      assert.equal(
        (await options()).numeradores.find((n) => n.Comprobante === "CM_C")!
          .ProximoNumero,
        numbering,
      );
      assert.equal(
        (await pending()).registros.find((r) => r.IDTabla === d)!.Pendiente,
        "10.00",
      );
      await create(input, key);
    },
  );
  await t.test(
    "cierre inmutable y reversión al día siguiente con deuda nueva y compensación del anticipo",
    async () => {
      const d = await debt("CM_J", "80");
      const original = await create(
        cashInput({
          ImporteEfectivo: "100",
          ImporteACuenta: "20",
          Afectaciones: [{ CuentaCorriente: d, Importe: "80" }],
        }),
      );
      const [before] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?",
        [original.registro.IDTabla],
      );
      const current = (await options()).aperturas.find(
        (o) => o.IDTabla === box,
      )!;
      await good(
        await req("/cajas/" + box + "/cerrar", "POST", {
          SaldoContado: current.SaldoActual,
          Observacion: null,
        }),
      );
      const [closed] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM CAJASALDO WHERE IDTabla=?",
        [box],
      );
      const oldBox = box;
      assert.equal(
        (
          await req(
            "",
            "POST",
            cashInput({ ImporteEfectivo: "10", ImporteACuenta: "10" }),
          )
        ).status,
        409,
      );
      await good(
        await req("/cajas", "POST", { Caja: "CM_CAJA", SaldoInicial: "1000" }),
        201,
      );
      box = (await options()).aperturas.find(
        (o) => o.Caja === "CM_CAJA",
      )!.IDTabla;
      const r = await good<CashDetail>(
        await req(
          "/" + original.registro.IDTabla + "/revertir",
          "POST",
          {
            CajaSaldo: box,
            Motivo: "Corrección posterior al cierre",
          },
          randomUUID(),
          original.version,
        ),
      );
      assert.equal(r.registro.CajaMovimientoOrigen, original.registro.IDTabla);
      const [after] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?",
        [original.registro.IDTabla],
      );
      assert.deepEqual(after, before);
      const [stillClosed] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM CAJASALDO WHERE IDTabla=?",
        [oldBox],
      );
      assert.deepEqual(stillClosed, closed);
      const status = await good<{ Estado: string }>(
        await req("/cajas/" + oldBox + "/estado"),
      );
      assert.equal(status.Estado, "CERRADO");
      assert.equal(
        (await good<{ Estado: string }>(await req("/cajas/" + box + "/estado")))
          .Estado,
        "ABIERTO",
      );
      // Los asientos vinculados a la reversión siguen disponibles para afectar, aunque el listado principal no los exponga.
      const visible = await good<CurrentAccountList>(
        await fetch(
          base + "/api/cuenta-corriente?Cliente=CM_A&Estado=TODOS&limite=100",
          { headers: { Cookie: admin.cookie } },
        ),
      );
      assert.ok(visible.registros.every((row) => row.CajaMovimiento === null));
      assert.ok(!(await pending()).registros.some((r) => r.IDTabla === d));
      const [pendingNew] = await pool.execute<RowDataPacket[]>(
        "SELECT IDTabla FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
        [r.registro.IDTabla],
      );
      assert.equal(
        (await pending()).registros.find(
          (r) => r.IDTabla === String(pendingNew[0]!.IDTabla),
        )!.Pendiente,
        "80.00",
      );
      const originalNow = await good<CashDetail>(
        await req("/" + original.registro.IDTabla),
      );
      assert.equal(originalNow.registro.DisponibleACuenta, "0.00");
      assert.equal(originalNow.registro.Estado, "REVERTIDO");
      assert.equal(
        (
          await req(
            "/" + original.registro.IDTabla + "/revertir",
            "POST",
            {
              CajaSaldo: box,
              Motivo: "Duplicada",
            },
            randomUUID(),
            original.version,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "/" + first.registro.IDTabla + "/revertir",
            "POST",
            {
              CajaSaldo: box,
              Motivo: "Cheque utilizado",
            },
            randomUUID(),
            first.version,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "reversión de cheque propio conserva historia y diferencia de caja exige observación",
    async () => {
      const reversed = await good<CashDetail>(
        await req(
          "/" + ownPayment.registro.IDTabla + "/revertir",
          "POST",
          {
            CajaSaldo: box,
            Motivo: "Cheque no entregado",
          },
          randomUUID(),
          ownPayment.version,
        ),
      );
      assert.equal(reversed.valores[0]!.Estado, "ANULADO");
      const [o] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CHEQUEEVENTO WHERE Cheque=?",
        [ownPayment.valores[0]!.IDTabla],
      );
      assert.equal(Number(o[0]!.total), 2);
      assert.equal(
        (
          await req("/cajas/" + box + "/cerrar", "POST", {
            SaldoContado: "1",
            Observacion: null,
          })
        ).status,
        400,
      );
      await good(
        await req("/cajas/" + box + "/cerrar", "POST", {
          SaldoContado: "1",
          Observacion: "Diferencia de prueba sin ajuste automático",
        }),
      );
    },
  );
  await t.test(
    "el límite de saldo de caja se comprueba antes de confirmar",
    async () => {
      const opened = await good<{ IDTabla: string }>(
        await req("/cajas", "POST", {
          Caja: "CM_CAJA2",
          SaldoInicial: "9999999999999999.99",
        }),
        201,
      );
      const response = await req(
        "",
        "POST",
        cashInput({
          CajaSaldo: opened.IDTabla,
          ImporteEfectivo: "0.01",
          ImporteACuenta: "0.01",
        }),
      );
      assert.equal(response.status, 400);
    },
  );
});
