import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type {
  CurrentAccountDetail,
  CurrentAccountInput,
  CurrentAccountList,
  SessionResponse,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";

test("Cuenta corriente: circuito financiero real en base aislada", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('LECTOR_CC','Consulta')",
  );
  const hash = await hashPassword(password);
  for (const Rol of ["ADMIN", "LECTOR_CC"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [Rol, Rol + "-cc@example.invalid", hash, Rol, new Date()],
    );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('CC_T','Jugadores')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('CC_J','Jugador de cuenta','CC_T')",
  );
  for (const [code, account, nature, module, funds] of [
    ["CC_D", "COBRAR", "DEUDA", "CUENTACORRIENTE", "NOAPLICA"],
    ["CC_C", "COBRAR", "CREDITO", "CUENTACORRIENTE", "NOAPLICA"],
    ["CC_P", "PAGAR", "DEUDA", "CUENTACORRIENTE", "NOAPLICA"],
    ["CC_PC", "PAGAR", "CREDITO", "CUENTACORRIENTE", "NOAPLICA"],
    ["CC_BAD", "COBRAR", "CREDITO", "COBROSPAGOS", "INGRESO"],
    ["CC_FUNDS", "COBRAR", "DEUDA", "CUENTACORRIENTE", "INGRESO"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,ModuloOrigen,SentidoFondos) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, module, funds],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Comprobante,Serie,ProximoNumero) VALUES ('CC_D','0001',1),('CC_D','0000',1),('CC_D','A',1)",
  );
  const [numbers] = await pool.query<RowDataPacket[]>(
    "SELECT IDTabla,Serie FROM NUMERACION WHERE Comprobante='CC_D'",
  );
  const num = String(numbers.find((r) => r.Serie === "0001")!.IDTabla),
    zero = String(numbers.find((r) => r.Serie === "0000")!.IDTabla);
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    masters: createMasterStore(pool),
    currentAccount: createCurrentAccountStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  async function login(role: string) {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({ email: role + "-cc@example.invalid", password }),
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0]!,
      session: (await response.json()) as SessionResponse,
    };
  }
  const admin = await login("ADMIN"),
    reader = await login("LECTOR_CC");
  async function req(
    path = "",
    method = "GET",
    input?: unknown,
    token = randomUUID(),
    version?: string,
  ) {
    return fetch(base + "/api/cuenta-corriente" + path, {
      method,
      headers: {
        Cookie: admin.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": admin.session.csrfToken,
        "Idempotency-Key": token,
        ...(version ? { "If-Match": '"' + version + '"' } : {}),
      },
      ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
    });
  }
  const input = (
    number: string,
    extra: Partial<CurrentAccountInput> = {},
  ): CurrentAccountInput => ({
    Cliente: "CC_J",
    Comprobante: "CC_D",
    Numeracion: null,
    NumeroComprobante: number,
    FechaOrigen: "2026-10-25",
    Vencimiento: null,
    Importe: "100.25",
    Observacion: null,
    ...extra,
  });
  async function create(
    number: string,
    extra: Partial<CurrentAccountInput> = {},
    key = randomUUID(),
  ) {
    const r = await req("", "POST", input(number, extra), key);
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()) as CurrentAccountDetail;
  }
  async function list(query = "") {
    const r = await req("?Cliente=CC_J" + query);
    assert.equal(r.status, 200, await r.clone().text());
    return (await r.json()) as CurrentAccountList;
  }
  async function get(id: string) {
    const r = await req("/" + id);
    assert.equal(r.status, 200);
    return (await r.json()) as CurrentAccountDetail;
  }
  let debt: CurrentAccountDetail;
  await t.test(
    "acceso, opciones compatibles y validación sin movimientos automáticos",
    async () => {
      assert.equal((await fetch(base + "/api/cuenta-corriente")).status, 401);
      assert.equal(
        (
          await fetch(base + "/api/cuenta-corriente", {
            headers: { Cookie: reader.cookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/api/cuenta-corriente", {
            method: "POST",
            headers: {
              Cookie: reader.cookie,
              "Content-Type": "application/json",
              "X-ERP-Request": "1",
              "X-CSRF-Token": reader.session.csrfToken,
            },
            body: "{}",
          })
        ).status,
        403,
      );
      const r = await req("/opciones");
      const options = (await r.json()) as {
        comprobantes: { Codigo: string }[];
        numeraciones: { Serie: string }[];
      };
      assert.ok(options.comprobantes.some((v) => v.Codigo === "CC_D"));
      assert.ok(
        !options.comprobantes.some(
          (v) => v.Codigo === "CC_BAD" || v.Codigo === "CC_FUNDS",
        ),
      );
      assert.ok(!options.numeraciones.some((v) => v.Serie === "A"));
      assert.equal((await list()).total, 0);
      for (const extra of [
        { Importe: "0" },
        { Numeracion: "abc" },
        { Numeracion: "1e8" },
        { Numeracion: "9223372036854775808" },
        { Importe: "1.001" },
        { Importe: "1e2" },
        { Importe: "-1" },
        { FechaOrigen: "2026-02-30" },
        { Vencimiento: "2026-10-24" },
        { NumeroComprobante: "0000-00000000" },
        { NumeroComprobante: "0001-00000001" },
        { Comprobante: "CC_BAD" },
        { Comprobante: "CC_FUNDS" },
        { Cliente: "NOEXISTE" },
      ])
        assert.equal(
          (await req("", "POST", { ...input("0000-00000001"), ...extra }))
            .status,
          400,
          JSON.stringify(extra),
        );
      assert.equal((await list()).total, 0);
    },
  );
  await t.test(
    "deuda, crédito y premio mantienen decimales exactos y cuentas separadas",
    async () => {
      debt = await create("0000-00000001");
      await create("0000-00000002", { Importe: "0.10" });
      await create("0000-00000001", { Comprobante: "CC_C", Importe: "30.05" });
      await create("0000-00000001", { Comprobante: "CC_P", Importe: "200.00" });
      await create("0000-00000001", { Comprobante: "CC_PC", Importe: "5.50" });
      assert.equal(debt.registro.NumeroComprobante, "0000-00000001");
      assert.equal(debt.registro.Numeracion, null);
      assert.equal(debt.registro.Cuenta, "COBRAR");
      assert.equal(debt.registro.Naturaleza, "DEUDA");
      const data = await list();
      assert.deepEqual(data.saldos, { Cobrar: "70.30", Pagar: "194.50" });
      const filtered = await list("&Cuenta=PAGAR&q=CC_P&limite=1");
      assert.equal(filtered.total, 2);
      assert.equal(filtered.registros.length, 1);
      assert.deepEqual(filtered.saldos, data.saldos);
      assert.equal((await list("&Desde=2027-01-01")).total, 0);
      assert.deepEqual((await list("&Desde=2027-01-01")).saldos, data.saldos);
      assert.equal(
        (await list("&q=" + encodeURIComponent("' OR 1=1 --"))).total,
        0,
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CAJAMOVIMIENTO WHERE Comprobante LIKE 'CC_%'",
      );
      assert.equal(
        Number(rows[0]!.total),
        0,
        "Cuenta corriente no mueve fondos",
      );
      assert.equal(
        (await req("/" + debt.registro.IDTabla, "PUT", {})).status,
        404,
      );
      assert.equal(
        (await req("/" + debt.registro.IDTabla, "DELETE", {})).status,
        404,
      );
    },
  );
  await t.test(
    "Numerador sugiere sin consumir y actualiza solo al confirmar, con número editable",
    async () => {
      const before = await req("/opciones");
      await before.json();
      const [initial] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [num],
      );
      assert.equal(String(initial[0]!.ProximoNumero), "1");
      await create("0001-00000050", { Numeracion: num });
      await create("0001-00000025", { Numeracion: num });
      const [next] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [num],
      );
      assert.equal(String(next[0]!.ProximoNumero), "51");
      assert.equal(
        (await req("", "POST", input("0002-00000051", { Numeracion: num })))
          .status,
        409,
      );
      assert.equal(
        (await req("", "POST", input("0000-00000001", { Numeracion: zero })))
          .status,
        409,
        "La serie 0000 y el modo manual comparten el espacio de números",
      );
      const [stays] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [zero],
      );
      assert.equal(String(stays[0]!.ProximoNumero), "1");
    },
  );
  await t.test(
    "concurrencia entre dos instancias y pools independientes; reintentos sin duplicados",
    async () => {
      const secondDb = createDatabase(config);
      const second = createApp({
        checkDatabase: async () => {},
        auth: createAuthService(createAuthStore(secondDb.pool)),
        currentAccount: createCurrentAccountStore(secondDb.pool),
      }).listen(0, "127.0.0.1");
      await once(second, "listening");
      const a = second.address();
      assert.ok(a && typeof a !== "string");
      try {
        const urls = [base, `http://127.0.0.1:${a.port}`];
        const results = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            fetch(urls[i % 2] + "/api/cuenta-corriente", {
              method: "POST",
              headers: {
                Cookie: admin.cookie,
                "Content-Type": "application/json",
                "X-ERP-Request": "1",
                "X-CSRF-Token": admin.session.csrfToken,
                "Idempotency-Key": randomUUID(),
              },
              body: JSON.stringify(input("0000-00000999")),
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 7);
        const key = randomUUID(),
          payload = input("0000-00000888");
        const retries = await Promise.all(
          Array.from({ length: 6 }, () => req("", "POST", payload, key)),
        );
        assert.ok(retries.every((r) => r.status === 201));
        const records = await Promise.all(
          retries.map((r) => r.json() as Promise<CurrentAccountDetail>),
        );
        assert.equal(new Set(records.map((r) => r.registro.IDTabla)).size, 1);
        assert.equal(
          (await req("", "POST", { ...payload, Importe: "2.00" }, key)).status,
          409,
        );
        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM CUENTACORRIENTE WHERE Cliente='CC_J' AND Numero IN (888,999)",
        );
        assert.equal(Number(rows[0]!.total), 2);
      } finally {
        await new Promise<void>((resolve) => second.close(() => resolve()));
        await secondDb.pool.end();
      }
    },
  );
  await t.test(
    "snapshot de configuración, anulación con motivo e historial sin reutilización",
    async () => {
      const before = await get(debt.registro.IDTabla);
      await pool.query(
        "UPDATE COMPROBANTE SET Cuenta='PAGAR',Naturaleza='CREDITO',Descripcion='Cambió configuración' WHERE Codigo='CC_D'",
      );
      const same = await get(debt.registro.IDTabla);
      assert.equal(same.registro.Cuenta, "COBRAR");
      assert.equal(same.registro.Naturaleza, "DEUDA");
      assert.equal(same.version, before.version);
      const prior = (await list()).saldos!;
      const key = randomUUID();
      const r = await req(
        "/" + same.registro.IDTabla + "/anular",
        "POST",
        { Motivo: "Error de carga" },
        key,
        same.version,
      );
      assert.equal(r.status, 200, await r.clone().text());
      const result = (await r.json()) as CurrentAccountDetail;
      assert.equal(result.registro.Estado, "ANULADO");
      assert.equal(result.registro.MotivoAnulacion, "Error de carga");
      assert.equal(
        (
          await req(
            "/" + same.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "Error de carga" },
            key,
            same.version,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            "/" + same.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "Otra" },
            randomUUID(),
            same.version,
          )
        ).status,
        409,
      );
      assert.equal((await req("", "POST", input("0000-00000001"))).status, 409);
      const after = (await list()).saldos!;
      const cents = (value: string) => BigInt(value.replace(".", ""));
      assert.equal(cents(prior.Cobrar) - cents(after.Cobrar), 10025n);
      assert.equal(prior.Pagar, after.Pagar);
      const [audit] = await pool.execute<RowDataPacket[]>(
        "SELECT Accion FROM AUDITORIA WHERE Tabla='CUENTACORRIENTE' AND Registro=? ORDER BY IDTabla",
        [same.registro.IDTabla],
      );
      assert.deepEqual(
        audit.map((r) => r.Accion),
        ["ALTA", "ANULACION"],
      );
      await pool.query(
        "UPDATE COMPROBANTE SET Cuenta='COBRAR',Naturaleza='DEUDA' WHERE Codigo='CC_D'",
      );
    },
  );
  await t.test(
    "exactitud de importes grandes y rollback completo si falla auditoría",
    async () => {
      const huge = await create("0000-00000777", {
        Comprobante: "CC_P",
        Importe: "9007199254740993.01",
      });
      assert.equal(huge.registro.Importe, "9007199254740993.01");
      assert.equal((await list()).saldos!.Pagar, "9007199254741187.51");
      const [before] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [num],
      );
      const key = randomUUID();
      // Inyección solo en el punto de auditoría. El INSERT financiero y el
      // avance del Numerador se ejecutan realmente y deben revertirse.
      const failingPool = new Proxy(pool, {
        get(target, property) {
          if (property === "getConnection")
            return async () => {
              const connection = await target.getConnection();
              return new Proxy(connection, {
                get(connection, method) {
                  if (method === "execute")
                    return (sql: string, ...args: unknown[]) => {
                      if (sql.startsWith("INSERT INTO AUDITORIA"))
                        throw new Error("Falla de auditoría simulada");
                      return Reflect.get(connection, method).apply(connection, [
                        sql,
                        ...args,
                      ]);
                    };
                  const value = Reflect.get(connection, method);
                  return typeof value === "function"
                    ? value.bind(connection)
                    : value;
                },
              });
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      await assert.rejects(
        createCurrentAccountStore(failingPool).create(
          input("0001-00000555", { Numeracion: num }),
          admin.session.usuario.id,
          key,
        ),
        /Falla de auditoría simulada/,
      );
      const [after] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [num],
      );
      assert.equal(
        String(after[0]!.ProximoNumero),
        String(before[0]!.ProximoNumero),
      );
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM SOLICITUD WHERE Clave=?",
        [key],
      );
      assert.equal(Number(rows[0]!.total), 0);
      await create("0001-00000555", { Numeracion: num }, key);
    },
  );
  await t.test(
    "anulación rechaza motivos vacíos, operaciones vinculadas y solicitudes sin CSRF",
    async () => {
      const fresh = await create("0000-00000666");
      assert.equal(
        (
          await req(
            "/" + fresh.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "" },
            randomUUID(),
            fresh.version,
          )
        ).status,
        400,
      );
      const forbidden = await fetch(
        base + "/api/cuenta-corriente/" + fresh.registro.IDTabla + "/anular",
        {
          method: "POST",
          headers: {
            Cookie: admin.cookie,
            "Content-Type": "application/json",
            "X-ERP-Request": "1",
            "Idempotency-Key": randomUUID(),
            "If-Match": '"' + fresh.version + '"',
          },
          body: JSON.stringify({ Motivo: "No autorizado" }),
        },
      );
      assert.equal(forbidden.status, 403);
      const [created] = await pool.execute<ResultSetHeader>(
        "INSERT INTO CAJAMOVIMIENTO (Comprobante,Numeracion,Numero,FechaOrigen,ImporteTotal,Sentido,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          "CC_D",
          num,
          "9999",
          "2026-10-25",
          "1.00",
          "INGRESO",
          "CONFIRMADO",
          admin.session.usuario.id,
          new Date(),
        ],
      );
      const movement = String(created.insertId);
      await pool.execute(
        "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe) VALUES (?,?,?)",
        [movement, fresh.registro.IDTabla, "1.00"],
      );
      assert.equal(
        (
          await req(
            "/" + fresh.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "Tiene afectación" },
            randomUUID(),
            fresh.version,
          )
        ).status,
        409,
      );
      const generated = await create("0000-00000667");
      await pool.execute(
        "UPDATE CUENTACORRIENTE SET CajaMovimiento=? WHERE IDTabla=?",
        [movement, generated.registro.IDTabla],
      );
      const linked = await get(generated.registro.IDTabla);
      assert.equal(
        (
          await req(
            "/" + linked.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "Generado por otra operación" },
            randomUUID(),
            linked.version,
          )
        ).status,
        409,
      );
      const [rows] = await pool.query<RowDataPacket[]>("SHOW TABLES");
      assert.equal(rows.length, 22, "No se agregan tablas al esquema");
    },
  );
  await t.test(
    "serie 1, importe 10, vencimiento igual al origen y observaciones vacías se confirman",
    async () => {
      await pool.execute(
        "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES (?,?,?)",
        ["CC_02", "Leandro Paredes", "CC_T"],
      );
      await pool.execute(
        "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES (?,?,?,?,?,?)",
        [
          "CC_REPRO",
          "Ingreso de apuesta",
          "CUENTACORRIENTE",
          "COBRAR",
          "DEUDA",
          "NOAPLICA",
        ],
      );
      const numerator = await fetch(base + "/api/maestros/numeraciones", {
        method: "POST",
        headers: {
          Cookie: admin.cookie,
          "Content-Type": "application/json",
          "X-ERP-Request": "1",
          "X-CSRF-Token": admin.session.csrfToken,
        },
        body: JSON.stringify({
          Comprobante: "CC_REPRO",
          Serie: "1",
          ProximoNumero: "1",
          Activo: true,
        }),
      });
      assert.equal(numerator.status, 201, await numerator.clone().text());
      const numbering = (await numerator.json()) as {
        registro: { IDTabla: string };
      };
      const date = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date());
      const response = await req(
        "",
        "POST",
        input("0001-00000001", {
          Cliente: "CC_02",
          Comprobante: "CC_REPRO",
          Numeracion: numbering.registro.IDTabla,
          FechaOrigen: date,
          Vencimiento: date,
          Importe: "10",
          Observacion: null,
        }),
      );
      assert.equal(response.status, 201, await response.clone().text());
      const result = (await response.json()) as CurrentAccountDetail;
      assert.equal(result.registro.ClienteNombre, "Leandro Paredes");
      assert.equal(result.registro.NumeroComprobante, "0001-00000001");
      assert.equal(result.registro.Importe, "10.00");
      assert.equal(result.registro.Vencimiento, date);
      assert.equal(result.registro.Observacion, null);
      assert.equal(result.registro.Cuenta, "COBRAR");
      assert.equal(result.registro.Naturaleza, "DEUDA");
      const persisted = await get(result.registro.IDTabla);
      assert.equal(persisted.registro.Estado, "CONFIRMADO");
      const [next] = await pool.execute<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION WHERE IDTabla=?",
        [numbering.registro.IDTabla],
      );
      assert.equal(String(next[0]!.ProximoNumero), "2");
    },
  );
});
