import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  AccountSummary,
  CashDetail,
  CurrentAccountDetail,
  SessionResponse,
  UserDetail,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import {
  hashPassword,
  verifyPassword,
} from "../../apps/api/src/auth/crypto.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createUserStore } from "../../apps/api/src/users/store.js";
import { createReportStore } from "../../apps/api/src/reports/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";

test("Usuarios por menú e informe actual sobre circuitos financieros reales", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config),
    password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador')",
  );
  await pool.execute(
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Administrador RS','rs-admin@example.invalid',?,'ADMIN',?)",
    [await hashPassword(password), new Date()],
  );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    users: createUserStore(pool),
    reports: createReportStore(pool),
    masters: createMasterStore(pool),
    currentAccount: createCurrentAccountStore(pool),
    cashMovement: createCashMovementStore(pool),
    treasury: createCashMovementStore(pool, "TESORERIA"),
    values: createValuesStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  async function login(email: string, pass = password) {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({ email, password: pass }),
    });
    return {
      response: r,
      cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      session: (await r.json()) as SessionResponse,
    };
  }
  const admin = await login("rs-admin@example.invalid");
  assert.equal(admin.response.status, 200);
  type Identity = Pick<typeof admin, "cookie" | "session">;
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    who: Identity = admin,
    version?: string,
  ) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        Cookie: who.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": who.session.csrfToken,
        "Idempotency-Key": randomUUID(),
        ...(version ? { "If-Match": `"${version}"` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function json<T>(r: Response, status = 200): Promise<T> {
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data as T;
  }
  let user: UserDetail,
    operator: Awaited<ReturnType<typeof login>>,
    box: string,
    debt: CurrentAccountDetail,
    prize: CurrentAccountDetail,
    receipt: CashDetail,
    payment: CashDetail;
  const input = {
    nombre: "Persona de operación",
    email: "rs-user@example.invalid",
    activo: true,
    permisos: [
      { menu: "cuenta-corriente", escritura: true },
      { menu: "cobros-pagos", escritura: true },
      { menu: "informes-cuenta-corriente", escritura: false },
    ],
  };
  await t.test(
    "administración exclusiva, CSRF, datos estrictos y claves sin exposición",
    async () => {
      assert.equal((await fetch(base + "/api/usuarios")).status, 401);
      assert.equal(
        (
          await fetch(base + "/api/usuarios", {
            method: "POST",
            headers: {
              Cookie: admin.cookie,
              "Content-Type": "application/json",
              "X-ERP-Request": "1",
            },
            body: JSON.stringify({ ...input, password }),
          })
        ).status,
        403,
      );
      assert.equal(
        (await req("/usuarios", "POST", { ...input, password: "corta" }))
          .status,
        400,
      );
      assert.equal(
        (await req("/usuarios", "POST", { ...input, password, Rol: "ADMIN" }))
          .status,
        400,
      );
      user = await json<UserDetail>(
        await req("/usuarios", "POST", { ...input, password }),
        201,
      );
      assert.equal(user.registro.administrador, false);
      assert.equal("ClaveHash" in user.registro, false);
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT ClaveHash FROM USUARIO WHERE IDTabla=?",
        [user.registro.id],
      );
      assert.ok(await verifyPassword(password, String(rows[0]!.ClaveHash)));
      assert.equal(
        (await req("/usuarios", "POST", { ...input, password })).status,
        409,
      );
      operator = await login(input.email);
      assert.equal(operator.response.status, 200);
      assert.deepEqual(operator.session.usuario.permisos, input.permisos);
      for (const route of [
        "/usuarios",
        "/maestros/clientes",
        "/maestros/bancos",
        "/tesoreria",
        "/valores",
      ])
        assert.equal(
          (await req(route, "GET", undefined, operator)).status,
          403,
          route,
        );
      assert.equal(
        (
          await req(
            "/usuarios/" + user.registro.id + "/clave",
            "POST",
            { password },
            operator,
            user.version,
          )
        ).status,
        403,
      );
    },
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('RS_T','Prueba informe')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo,Email,Observacion) VALUES ('RS_A','Cliente resumen','RS_T','private@example.invalid','No exponer en búsqueda auxiliar'),('RS_B','Otro cliente resumen','RS_T',NULL,NULL)",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('RS_CAJA','Caja resumen')",
  );
  for (const [code, account, nature, sense, module] of [
    ["RS_D", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["RS_PR", "PAGAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["RS_CR", "COBRAR", "CREDITO", "NOAPLICA", "CUENTACORRIENTE"],
    ["RS_C", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["RS_P", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["RS_RC", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, sense, module],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('RS_RC',100000001)",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET Numerador='RS_RC',EsReversion=1 WHERE Codigo='RS_RC'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='RS_RC' WHERE Codigo='RS_C'",
  );
  let valueOperationId = "";
  let counter = 1;
  const number = () => String(700000000 + counter++);
  async function cc(Comprobante: string, Importe: string, Cliente = "RS_A") {
    return json<CurrentAccountDetail>(
      await req(
        "/cuenta-corriente",
        "POST",
        {
          Comprobante,
          Importe,
          Cliente,
          NumeroComprobante: number(),
          FechaOrigen: "2026-10-01",
          Vencimiento: "2026-10-01",
          Observacion: null,
        },
        operator,
      ),
      201,
    );
  }
  async function cash(
    Comprobante: string,
    ImporteEfectivo: string,
    CuentaCorriente: string,
    applied: string,
    advance = "0.00",
  ) {
    return json<CashDetail>(
      await req(
        "/caja-movimiento",
        "POST",
        {
          Comprobante,
          NumeroComprobante: number(),
          Cliente: "RS_A",
          FechaOrigen: "2026-10-02",
          CajaSaldo: box,
          Concepto: null,
          ImporteEfectivo,
          ImporteACuenta: advance,
          Observacion: null,
          Afectaciones: [{ CuentaCorriente, Importe: applied }],
          Valores: [],
        },
        operator,
      ),
      201,
    );
  }
  async function summary(q = "Cliente=RS_A") {
    return json<AccountSummary>(
      await req("/informes/cuenta-corriente?" + q, "GET", undefined, operator),
    );
  }
  await t.test(
    "permisos de operación sin habilitar los ABM auxiliares",
    async () => {
      const result = await json<{ registros: Record<string, unknown>[] }>(
        await req("/referencias/clientes?q=RS_A", "GET", undefined, operator),
      );
      assert.equal(result.registros.length, 1);
      assert.deepEqual(Object.keys(result.registros[0]!).sort(), [
        "Activo",
        "Codigo",
        "Nombre",
      ]);
      assert.equal(
        (await req("/referencias/bancos", "GET", undefined, operator)).status,
        403,
      );
      box = (
        await json<{ IDTabla: string }>(
          await req(
            "/caja-movimiento/cajas",
            "POST",
            { Caja: "RS_CAJA", SaldoInicial: "1000.00" },
            operator,
          ),
          201,
        )
      ).IDTabla;
      debt = await cc("RS_D", "1000.00");
      prize = await cc("RS_PR", "200.00");
      assert.equal(
        (
          await req(
            "/referencias/cuenta-corriente/" + debt.registro.IDTabla,
            "GET",
            undefined,
            operator,
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    "cobro y pago parciales: no restar dos veces las afectaciones",
    async () => {
      receipt = await cash("RS_C", "600.00", debt.registro.IDTabla, "600.00");
      payment = await cash("RS_P", "100.00", prize.registro.IDTabla, "100.00");
      const r = await summary(),
        row = r.registros[0]!;
      assert.equal(row.SaldoCobrar, "400.00");
      assert.equal(row.SaldoPagar, "100.00");
      assert.equal(row.SaldoNeto, "300.00");
      assert.equal(row.PendienteCobrar, "400.00");
      assert.equal(row.PendientePagar, "100.00");
      assert.equal(row.CreditoSinAplicarCobrar, "0.00");
    },
  );
  await t.test(
    "anticipos y créditos independientes: saldo y pendiente documental distintos",
    async () => {
      const advance = await cash(
        "RS_C",
        "600.00",
        debt.registro.IDTabla,
        "400.00",
        "200.00",
      );
      const credit = await cc("RS_CR", "50.00");
      let r = (await summary()).registros[0]!;
      assert.equal(r.SaldoCobrar, "-250.00");
      assert.equal(r.SaldoNeto, "-350.00");
      assert.equal(r.PendienteCobrar, "0.00");
      assert.equal(r.CreditoSinAplicarCobrar, "250.00");
      await json(
        await req(
          "/caja-movimiento/" + advance.registro.IDTabla + "/anular",
          "POST",
          {
            CajaSaldo: box,
            Motivo: "Corrección de prueba",
            ConfirmarCorreccionBancaria: false,
          },
          operator,
          advance.version,
        ),
      );
      const fresh = await json<CurrentAccountDetail>(
        await req(
          "/cuenta-corriente/" + credit.registro.IDTabla,
          "GET",
          undefined,
          operator,
        ),
      );
      await json(
        await req(
          "/cuenta-corriente/" + credit.registro.IDTabla + "/anular",
          "POST",
          { Motivo: "Prueba" },
          operator,
          fresh.version,
        ),
      );
      r = (await summary()).registros[0]!;
      assert.equal(r.SaldoCobrar, "400.00");
      assert.equal(r.PendienteCobrar, "400.00");
    },
  );
  await t.test(
    "reversión histórica: incluir original y contrapartida, sin reabrir dos deudas",
    async () => {
      await json(
        await req(
          "/caja-movimiento/cajas/" + box + "/cerrar",
          "POST",
          { SaldoContado: "1500.00", Observacion: null },
          operator,
        ),
      );
      box = (
        await json<{ IDTabla: string }>(
          await req(
            "/caja-movimiento/cajas",
            "POST",
            { Caja: "RS_CAJA", SaldoInicial: "1000.00" },
            operator,
          ),
          201,
        )
      ).IDTabla;
      const fresh = await json<CashDetail>(
        await req(
          "/caja-movimiento/" + receipt.registro.IDTabla,
          "GET",
          undefined,
          operator,
        ),
      );
      await json(
        await req(
          "/caja-movimiento/" + receipt.registro.IDTabla + "/revertir",
          "POST",
          { CajaSaldo: box, Motivo: "Corrección histórica" },
          operator,
          fresh.version,
        ),
      );
      const r = (await summary()).registros[0]!;
      assert.equal(r.SaldoCobrar, "1000.00");
      assert.equal(r.PendienteCobrar, "1000.00");
      assert.equal(r.SaldoPagar, "100.00");
      assert.equal(r.SaldoNeto, "900.00");
    },
  );
  await t.test(
    "depósito y acreditación no duplican saldos; el rechazo sí genera su deuda",
    async () => {
      await pool.query(
        "INSERT INTO BANCO (Codigo,Nombre) VALUES ('RS_BANK','Banco resumen')",
      );
      await pool.query(
        "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('RS_ACCOUNT','RS_BANK','Cuenta resumen','ERP')",
      );
      const received = await json<CashDetail>(
        await req(
          "/caja-movimiento",
          "POST",
          {
            Comprobante: "RS_C",
            NumeroComprobante: number(),
            Cliente: "RS_A",
            FechaOrigen: "2026-10-03",
            CajaSaldo: box,
            Concepto: null,
            ImporteEfectivo: "0.00",
            ImporteACuenta: "0.00",
            Observacion: null,
            Afectaciones: [
              { CuentaCorriente: debt.registro.IDTabla, Importe: "60.00" },
            ],
            Valores: [
              {
                Tipo: "TERCERO",
                Banco: "RS_BANK",
                BancoCuenta: null,
                CuentaLibradora: "123",
                Numero: "900001",
                Librador: "Emisor",
                Documento: null,
                Emision: "2026-10-02",
                Vencimiento: "2026-10-03",
                Importe: "60.00",
              },
            ],
          },
          operator,
        ),
        201,
      );
      valueOperationId = received.registro.IDTabla;
      const cheque = received.valores[0]!.IDTabla;
      assert.equal((await summary()).registros[0]!.SaldoCobrar, "940.00");
      await json(
        await req("/valores/depositos", "POST", {
          Cheques: [cheque],
          BancoCuenta: "RS_ACCOUNT",
          Fecha: "2026-10-04",
          Observacion: null,
        }),
      );
      assert.equal((await summary()).registros[0]!.SaldoCobrar, "940.00");
      await json(
        await req("/valores/acreditaciones", "POST", {
          Cheques: [cheque],
          Fecha: "2026-10-05",
          Observacion: null,
        }),
      );
      assert.equal((await summary()).registros[0]!.SaldoCobrar, "940.00");
      const preview = await json<{ version: string }>(
        await req("/valores/CHEQUE/" + cheque + "/rechazo"),
      );
      await json(
        await req(
          "/valores/CHEQUE/" + cheque + "/rechazar",
          "POST",
          {
            Comprobante: "RS_D",
            NumeroComprobante: number(),
            Fecha: "2026-10-06",
            Motivo: "Rechazo de prueba",
            ConfirmarDebitoBancario: true,
            FechaDebito: "2026-10-06",
          },
          admin,
          preview.version,
        ),
      );
      const row = (await summary()).registros[0]!;
      assert.equal(row.SaldoCobrar, "1000.00");
      assert.equal(row.PendienteCobrar, "1000.00");
    },
  );
  await t.test(
    "precisión decimal, clientes inactivos, filtros literales, orden global y totales sin paginar",
    async () => {
      await cc("RS_D", "90071992547409.91", "RS_B");
      await pool.query("UPDATE CLIENTE SET Activo=0 WHERE Codigo='RS_B'");
      const r = await summary(
        "q=RS_&limite=1&orden=SaldoCobrar&direccion=desc",
      );
      assert.equal(r.total, 2);
      assert.equal(r.registros[0]!.Cliente, "RS_B");
      assert.equal(r.totales.SaldoCobrar, "90071992548409.91");
      assert.equal(r.totales.SaldoPagar, "100.00");
      assert.equal(r.totales.SaldoNeto, "90071992548309.91");
      const second = await summary(
        "q=RS_&limite=1&pagina=2&orden=SaldoCobrar&direccion=desc",
      );
      assert.equal(second.registros[0]!.Cliente, "RS_A");
      assert.deepEqual(second.totales, r.totales);
      assert.equal((await summary("q=%25")).total, 0);
      assert.equal(
        (
          await req(
            "/informes/cuenta-corriente?Desde=2026-10-01",
            "GET",
            undefined,
            operator,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            "/informes/cuenta-corriente?orden=ClaveHash&direccion=desc",
            "GET",
            undefined,
            operator,
          )
        ).status,
        400,
      );
    },
  );
  await t.test("el informe no modifica ninguna tabla financiera", async () => {
    const tables = [
      "CUENTACORRIENTE",
      "CAJAMOVIMIENTO",
      "CAJAMOVIMIENTOAFECTACION",
      "CAJASALDO",
      "NUMERACION",
      "CHEQUE",
      "CHEQUEEVENTO",
      "TRANSFERENCIA",
      "BANCOMOVIMIENTO",
      "AUDITORIA",
      "SOLICITUD",
    ];
    async function snapshot() {
      return Promise.all(
        tables.map(
          async (table) =>
            (
              await pool.query(
                "SELECT * FROM " +
                  table +
                  " ORDER BY " +
                  (table === "NUMERACION" ? "Codigo" : "IDTabla"),
              )
            )[0],
        ),
      );
    }
    const before = await snapshot();
    await summary("q=RS_");
    assert.deepEqual(await snapshot(), before);
  });
  await t.test(
    "consulta por menú no permite escrituras y un usuario sin accesos queda restringido",
    async () => {
      const read = await json<UserDetail>(
        await req("/usuarios", "POST", {
          ...input,
          email: "rs-read@example.invalid",
          permisos: [{ menu: "cuenta-corriente", escritura: false }],
          password,
        }),
        201,
      );
      const logged = await login(read.registro.email);
      assert.equal(logged.response.status, 200);
      assert.equal(
        (await req("/cuenta-corriente", "GET", undefined, logged)).status,
        200,
      );
      assert.equal(
        (await req("/cuenta-corriente", "POST", {}, logged)).status,
        403,
      );
      const empty = await json<UserDetail>(
        await req("/usuarios", "POST", {
          ...input,
          email: "rs-empty@example.invalid",
          permisos: [],
          password,
        }),
        201,
      );
      const noAccess = await login(empty.registro.email);
      assert.equal(noAccess.response.status, 200);
      for (const path of [
        "/cuenta-corriente",
        "/informes/cuenta-corriente",
        "/referencias/clientes",
        "/usuarios",
      ])
        assert.equal(
          (await req(path, "GET", undefined, noAccess)).status,
          403,
          path,
        );
      assert.equal(
        (
          await req("/usuarios", "POST", {
            ...input,
            email: "rs-invalid@example.invalid",
            permisos: [{ menu: "usuarios", escritura: true }],
            password,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "Valores y Tesorería funcionan con sus referencias sin acceso al resto de módulos",
    async () => {
      const configured = await json<UserDetail>(
        await req("/usuarios", "POST", {
          ...input,
          email: "rs-value-only@example.invalid",
          permisos: [{ menu: "valores", escritura: true }],
          password,
        }),
        201,
      );
      const logged = await login(configured.registro.email);
      for (const path of [
        "/referencias/bancos",
        "/referencias/cuentas-bancarias",
        "/referencias/cuenta-corriente/opciones",
        "/referencias/caja-movimiento/" + valueOperationId,
      ])
        assert.equal(
          (await req(path, "GET", undefined, logged)).status,
          200,
          path,
        );
      for (const path of [
        "/cuenta-corriente/opciones",
        "/caja-movimiento/opciones",
        "/maestros/cuentas-bancarias",
      ])
        assert.equal(
          (await req(path, "GET", undefined, logged)).status,
          403,
          path,
        );
      assert.equal(
        (
          await req(
            "/referencias/caja-movimiento/" + receipt.registro.IDTabla,
            "GET",
            undefined,
            logged,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/referencias/cuenta-corriente/" + debt.registro.IDTabla,
            "GET",
            undefined,
            logged,
          )
        ).status,
        403,
      );
      const references = await json<{ registros: Record<string, unknown>[] }>(
        await req(
          "/referencias/cuentas-bancarias?q=RS_ACCOUNT",
          "GET",
          undefined,
          logged,
        ),
      );
      assert.equal(references.registros[0]!.Banco, "RS_BANK");
      assert.equal("CBU" in references.registros[0]!, false);
      const treasuryUser = await json<UserDetail>(
        await req("/usuarios", "POST", {
          ...input,
          email: "rs-treasury-only@example.invalid",
          permisos: [{ menu: "tesoreria", escritura: true }],
          password,
        }),
        201,
      );
      const treasuryLogin = await login(treasuryUser.registro.email);
      assert.equal(
        (
          await req(
            "/caja-movimiento/opciones",
            "GET",
            undefined,
            treasuryLogin,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            "/caja-movimiento/cajas/" + box + "/estado",
            "GET",
            undefined,
            treasuryLogin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("/tesoreria", "GET", undefined, treasuryLogin)).status,
        200,
      );
      assert.equal(
        (await req("/caja-movimiento", "GET", undefined, treasuryLogin)).status,
        403,
      );
    },
  );
  await t.test(
    "permisos nuevos revocan sesiones; sin permisos no hay APIs de operación",
    async () => {
      user = await json<UserDetail>(
        await req(
          "/usuarios/" + user.registro.id,
          "PUT",
          {
            ...input,
            permisos: [{ menu: "informes-cuenta-corriente", escritura: false }],
          },
          admin,
          user.version,
        ),
      );
      assert.equal(
        (await req("/cuenta-corriente", "GET", undefined, operator)).status,
        401,
      );
      operator = await login(input.email);
      assert.equal(operator.response.status, 200);
      assert.equal(
        (await req("/informes/cuenta-corriente", "GET", undefined, operator))
          .status,
        200,
      );
      for (const route of [
        "/cuenta-corriente",
        "/caja-movimiento",
        "/valores",
        "/maestros/clientes",
        "/referencias/cuenta-corriente/" + debt.registro.IDTabla,
      ])
        assert.equal(
          (await req(route, "GET", undefined, operator)).status,
          403,
          route,
        );
      assert.equal(
        (await req("/cuenta-corriente", "POST", {}, operator)).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/usuarios/" + user.registro.id,
            "PUT",
            input,
            admin,
            "a".repeat(64),
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "contraseña administrada, sesiones revocadas y cuenta desactivada",
    async () => {
      const newPassword = randomBytes(24).toString("hex");
      user = await json<UserDetail>(
        await req(
          "/usuarios/" + user.registro.id + "/clave",
          "POST",
          { password: newPassword },
          admin,
          user.version,
        ),
      );
      assert.equal(
        (await req("/informes/cuenta-corriente", "GET", undefined, operator))
          .status,
        401,
      );
      assert.equal((await login(input.email)).response.status, 401);
      operator = await login(input.email, newPassword);
      assert.equal(operator.response.status, 200);
      const [audit] = await pool.execute<RowDataPacket[]>(
        "SELECT Detalle FROM AUDITORIA WHERE Tabla='USUARIO' AND Registro=?",
        [user.registro.id],
      );
      const text = JSON.stringify(audit);
      assert.ok(!text.includes(password));
      assert.ok(!text.includes(newPassword));
      assert.ok(!text.includes("scrypt$"));
      user = await json<UserDetail>(
        await req(
          "/usuarios/" + user.registro.id,
          "PUT",
          { ...input, activo: false, permisos: [] },
          admin,
          user.version,
        ),
      );
      assert.equal(
        (await req("/informes/cuenta-corriente", "GET", undefined, operator))
          .status,
        401,
      );
      assert.equal(
        (await login(input.email, newPassword)).response.status,
        401,
      );
      const own = await json<UserDetail>(
        await req("/usuarios/" + admin.session.usuario.id),
      );
      assert.equal(
        (
          await req(
            "/usuarios/" + own.registro.id,
            "PUT",
            {
              nombre: own.registro.nombre,
              email: own.registro.email,
              activo: false,
              permisos: [],
            },
            admin,
            own.version,
          )
        ).status,
        400,
      );
    },
  );
  await t.test(
    "fallo tardío de auditoría revierte cambios de contraseña y revocaciones",
    async () => {
      const fresh = await json<UserDetail>(
        await req("/usuarios", "POST", {
          ...input,
          email: "rs-rollback@example.invalid",
          password,
        }),
        201,
      );
      const logged = await login(fresh.registro.email);
      assert.equal(logged.response.status, 200);
      const [before] = await pool.execute<RowDataPacket[]>(
        "SELECT ClaveHash FROM USUARIO WHERE IDTabla=?",
        [fresh.registro.id],
      );
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_RS_HOLD");
      try {
        assert.equal(
          (
            await req(
              "/usuarios/" + fresh.registro.id + "/clave",
              "POST",
              { password: randomBytes(24).toString("hex") },
              admin,
              fresh.version,
            )
          ).status,
          500,
        );
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_RS_HOLD TO AUDITORIA");
      }
      const [after] = await pool.execute<RowDataPacket[]>(
        "SELECT ClaveHash FROM USUARIO WHERE IDTabla=?",
        [fresh.registro.id],
      );
      assert.deepEqual(after, before);
      assert.equal(
        (await req("/auth/me", "GET", undefined, logged)).status,
        200,
      );
      const changed = await json<UserDetail>(
        await req(
          "/usuarios/" + fresh.registro.id + "/clave",
          "POST",
          { password: randomBytes(24).toString("hex") },
          admin,
          fresh.version,
        ),
      );
      const authStore = createAuthStore(pool);
      assert.equal(
        await authStore.createSession(
          changed.registro.id,
          "a".repeat(64),
          new Date(),
          new Date(Date.now() + 60000),
          String(before[0]!.ClaveHash),
        ),
        false,
        "Una autenticación con un hash anterior no deja una sesión tras restablecer la clave.",
      );
    },
  );
});
