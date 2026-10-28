import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  MasterList,
  CurrentAccountList,
  CashList,
  PendingList,
  SessionResponse,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";

test("Orden global: API autenticada, filtros y páginas reales", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_HOST, "127.0.0.1");
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  t.after(() => pool.end());
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador')",
  );
  const password = randomBytes(24).toString("hex");
  await pool.execute(
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Orden','orden@example.invalid',?,'ADMIN',NOW())",
    [await hashPassword(password)],
  );
  const [users] = await pool.query<RowDataPacket[]>(
    "SELECT IDTabla FROM USUARIO WHERE Email='orden@example.invalid'",
  );
  const user = String(users[0]!.IDTabla);
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('SO_T','Orden')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('SO_A','Zeta','SO_T'),('SO_Z','Alfa','SO_T')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('SO_A','Zeta'),('SO_Z','Alfa')",
  );
  await pool.query(
    "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES ('SO_J','SO Jugada','CUENTACORRIENTE','COBRAR','DEUDA','NOAPLICA'),('SO_C','SO Cobro','COBROSPAGOS','COBRAR','CREDITO','INGRESO')",
  );
  for (let i = 0; i < 25; i++) {
    const index = String(i).padStart(2, "0");
    await pool.execute(
      "INSERT INTO CONCEPTO (Codigo,Descripcion,Activo) VALUES (?,?,?)",
      ["SO_" + index, "Descripcion " + String(24 - i).padStart(2, "0"), i % 2],
    );
    await pool.execute(
      "INSERT INTO BANCOCUENTA (Codigo,Nombre,Banco,Titular) VALUES (?,?,?,'Orden')",
      ["SO_" + index, "Cuenta " + index, i % 2 ? "SO_Z" : "SO_A"],
    );
    const money = i === 24 ? "9007199254740993.01" : String(i + 1) + ".00";
    const date = "2026-10-" + String(25 - i).padStart(2, "0");
    await pool.execute(
      "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,NumeroComprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES (?,'SO_J',?,?,'COBRAR','DEUDA',?,'CONFIRMADO',?,NOW())",
      [i % 2 ? "SO_Z" : "SO_A", i + 1, date, money, user],
    );
    await pool.execute(
      "INSERT INTO CAJAMOVIMIENTO (Cliente,Comprobante,NumeroComprobante,FechaOrigen,ImporteTotal,Sentido,Estado,Usuario,CreadoEn) VALUES (?,'SO_C',?,?,?,'INGRESO','CONFIRMADO',?,NOW())",
      [i % 2 ? "SO_Z" : "SO_A", i + 1, date, money, user],
    );
    await pool.execute(
      "INSERT INTO CHEQUE (Comprobante,Tipo,Numero,Banco,CuentaLibradora,Emision,Vencimiento,Importe,Estado,Usuario,CreadoEn) VALUES ('SO_C','TERCERO',?,'SO_A','SO','2026-01-01',?,?,'CARTERA',?,NOW())",
      [String(i + 1), date, money, user],
    );
  }
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    masters: createMasterStore(pool),
    currentAccount: createCurrentAccountStore(pool),
    cashMovement: createCashMovementStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}/api/`;
  const login = await fetch(base + "auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
    body: JSON.stringify({ email: "orden@example.invalid", password }),
  });
  assert.equal(login.status, 200);
  const session = (await login.json()) as SessionResponse;
  assert.equal(session.usuario.id, user);
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const req = (path: string) =>
    fetch(base + path, { headers: { Cookie: cookie } });
  async function get<T>(path: string): Promise<T> {
    const r = await req(path);
    assert.equal(r.status, 200, await r.clone().text());
    return r.json() as Promise<T>;
  }
  const codes = (data: MasterList) =>
    data.registros.map((r) => String(r.Codigo));
  const suffix = (start: number, count: number, step = 1) =>
    Array.from(
      { length: count },
      (_, i) => "SO_" + String(start + i * step).padStart(2, "0"),
    );
  await t.test(
    "maestros: orden visible, filtros y segunda página sin reordenar solamente veinte filas",
    async () => {
      const defaults = await get<MasterList>(
        "maestros/conceptos?q=SO_&limite=5",
      );
      assert.equal(defaults.total, 25);
      assert.deepEqual(codes(defaults), suffix(0, 5));
      const desc = await get<MasterList>(
        "maestros/conceptos?q=SO_&limite=5&orden=Descripcion&direccion=desc",
      );
      assert.deepEqual(codes(desc), suffix(0, 5));
      const asc = await get<MasterList>(
        "maestros/conceptos?q=SO_&limite=5&orden=Descripcion&direccion=asc",
      );
      assert.deepEqual(codes(asc), suffix(24, 5, -1));
      const second = await get<MasterList>(
        "maestros/conceptos?q=SO_&limite=5&pagina=2&orden=Descripcion&direccion=asc",
      );
      assert.deepEqual(codes(second), suffix(19, 5, -1));
      assert.equal(second.total, 25);
      const active = await get<MasterList>(
        "maestros/conceptos?q=SO_&estado=activo&limite=5&orden=Descripcion&direccion=asc",
      );
      assert.equal(active.total, 12);
      assert.deepEqual(codes(active), suffix(23, 5, -2));
      assert.deepEqual(
        codes(await get<MasterList>("maestros/conceptos?q=SO_&limite=5")),
        codes(defaults),
      );
      const relations = await get<MasterList>(
        "maestros/cuentas-bancarias?q=SO_&limite=5&orden=Banco&direccion=asc",
      );
      assert.deepEqual(codes(relations), suffix(1, 5, 2));
      assert.ok(
        relations.registros.every(
          (r) => relations.descripciones!.Banco![String(r.Banco)] === "Alfa",
        ),
      );
    },
  );
  await t.test(
    "Cuenta corriente y Caja: ID ascendente, importes exactos, fecha real y nombre del cliente",
    async () => {
      for (const path of [
        "cuenta-corriente?Comprobante=SO_J",
        "caja-movimiento?q=SO Cobro",
      ]) {
        const baseList = await get<CurrentAccountList | CashList>(
          path + "&limite=5",
        );
        assert.equal(baseList.total, 25);
        assert.deepEqual(
          baseList.registros.map((r) => r.NumeroComprobante),
          ["1", "2", "3", "4", "5"],
        );
        const field = path.startsWith("cuenta") ? "Importe" : "ImporteTotal";
        const sorted = await get<CurrentAccountList | CashList>(
          path + `&limite=5&orden=${field}&direccion=desc`,
        );
        assert.deepEqual(
          sorted.registros.map((r) => r.NumeroComprobante),
          ["25", "24", "23", "22", "21"],
        );
        const next = await get<CurrentAccountList | CashList>(
          path + `&limite=5&pagina=2&orden=${field}&direccion=desc`,
        );
        assert.deepEqual(
          next.registros.map((r) => r.NumeroComprobante),
          ["20", "19", "18", "17", "16"],
        );
        const dates = await get<CurrentAccountList | CashList>(
          path + "&limite=5&orden=FechaOrigen&direccion=asc",
        );
        assert.deepEqual(
          dates.registros.map((r) => r.FechaOrigen),
          [
            "2026-10-01",
            "2026-10-02",
            "2026-10-03",
            "2026-10-04",
            "2026-10-05",
          ],
        );
        const names = await get<CurrentAccountList | CashList>(
          path + "&limite=5&orden=Cliente&direccion=asc",
        );
        assert.ok(names.registros.every((r) => r.Cliente === "SO_Z"));
        const filtered = await get<CurrentAccountList | CashList>(
          path +
            `&limite=5&Desde=2026-10-20&Hasta=2026-10-25&orden=${field}&direccion=desc`,
        );
        assert.equal(filtered.total, 6);
        assert.deepEqual(
          filtered.registros.map((r) => r.NumeroComprobante),
          ["6", "5", "4", "3", "2"],
        );
      }
    },
  );
  await t.test(
    "pendientes y cartera: orden global sin perder exclusiones ni selección",
    async () => {
      const before = await get<PendingList>(
        "caja-movimiento/pendientes?Cliente=SO_A&Comprobante=SO_C&limite=5",
      );
      assert.equal(before.total, 13);
      assert.deepEqual(
        before.registros.map((r) => r.NumeroComprobante),
        ["1", "3", "5", "7", "9"],
      );
      const sorted = await get<PendingList>(
        "caja-movimiento/pendientes?Cliente=SO_A&Comprobante=SO_C&limite=5&orden=Pendiente&direccion=desc",
      );
      assert.deepEqual(
        sorted.registros.map((r) => r.NumeroComprobante),
        ["25", "23", "21", "19", "17"],
      );
      const id = sorted.registros[0]!.IDTabla;
      const excluded = await get<PendingList>(
        "caja-movimiento/pendientes?Cliente=SO_A&Comprobante=SO_C&limite=5&orden=Pendiente&direccion=desc&Excluir=" +
          id,
      );
      assert.equal(excluded.total, 12);
      assert.deepEqual(
        excluded.registros.map((r) => r.NumeroComprobante),
        ["23", "21", "19", "17", "15"],
      );
      assert.equal(
        (
          await get<PendingList>(
            "caja-movimiento/pendientes?Cliente=SO_A&Comprobante=SO_C&limite=5&orden=Pendiente&direccion=desc",
          )
        ).registros[0]!.Pendiente,
        "9007199254740993.01",
      );
      const portfolio = await get<{
        registros: { Numero: string }[];
        total: number;
      }>("caja-movimiento/cartera?q=Zeta&limite=5&orden=Numero&direccion=desc");
      assert.equal(portfolio.total, 25);
      assert.deepEqual(
        portfolio.registros.map((r) => r.Numero),
        ["25", "24", "23", "22", "21"],
      );
      const second = await get<{ registros: { Numero: string }[] }>(
        "caja-movimiento/cartera?q=Zeta&limite=5&pagina=2&orden=Numero&direccion=desc",
      );
      assert.deepEqual(
        second.registros.map((r) => r.Numero),
        ["20", "19", "18", "17", "16"],
      );
    },
  );
  await t.test(
    "orden inválido se rechaza sin interpolar SQL ni permitir columnas internas",
    async () => {
      for (const path of [
        "maestros/conceptos?",
        "cuenta-corriente?",
        "caja-movimiento?",
        "caja-movimiento/pendientes?Cliente=SO_A&Comprobante=SO_C&",
        "caja-movimiento/cartera?",
      ]) {
        for (const q of [
          "orden=NOEXISTE&direccion=desc",
          "orden=IDTabla&direccion=desc",
          "direccion=asc",
          "orden=Importe",
          "orden=Importe&direccion=DESC%3BDROP",
          "orden=__proto__&direccion=asc",
        ]) {
          const r = await req(path + q);
          assert.equal(r.status, 400, path + q);
        }
      }
      assert.equal(
        (await get<CurrentAccountList>("cuenta-corriente?Comprobante=SO_J"))
          .total,
        25,
      );
    },
  );
});
