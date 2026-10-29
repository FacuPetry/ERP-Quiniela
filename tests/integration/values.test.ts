import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  CashDetail,
  ValueList,
  ValueRecordDetail,
  SessionResponse,
} from "@erp/shared";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createApp } from "../../apps/api/src/app.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";
import { valueQuery } from "../../apps/api/src/values/validation.js";

test("Valores: consulta de instrumentos reales, historial, filtros y ausencia de escrituras", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  assert.equal(config.DB_HOST, "127.0.0.1");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const rows = async (sql: string, params: (string | number)[] = []) =>
    (await pool.execute<RowDataPacket[]>(sql, params))[0];
  const password = randomBytes(24).toString("hex"),
    hash = await hashPassword(password);
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('VX_READER','Consulta de valores')",
  );
  for (const role of ["ADMIN", "VX_READER"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [role, role + "-values@example.invalid", hash, role, new Date()],
    );
  const user = String(
    (
      await rows(
        "SELECT IDTabla FROM USUARIO WHERE Email='ADMIN-values@example.invalid'",
      )
    )[0]!.IDTabla,
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('VX_T','Tipo valores')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('VX_C','Cliente de Valores','VX_T')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('VX_BOX','Caja Valores')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('VX_B','Banco Valores')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('VX_ACC','VX_B','Cuenta Valores','ERP')",
  );
  for (const [code, nature, sense] of [
    ["VX_COBRO", "CREDITO", "INGRESO"],
    ["VX_PAGO", "CREDITO", "EGRESO"],
    ["VX_REV", "DEUDA", "EGRESO"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES (?,?,'COBROSPAGOS',?,?,?)",
      [code, code, code === "VX_PAGO" ? "PAGAR" : "COBRAR", nature!, sense!],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('VX_N',800000100)",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET EsReversion=1,Numerador='VX_N' WHERE Codigo='VX_REV'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='VX_REV' WHERE Codigo='VX_COBRO'",
  );
  const cash = createCashMovementStore(pool);
  const box = await cash.open(
    { Caja: "VX_BOX", SaldoInicial: "100.00" },
    user,
    randomUUID(),
  );
  let number = 800000001n;
  const input = (
    Comprobante: string,
    total: string,
    Valores: CashInput["Valores"],
  ): CashInput => ({
    Comprobante,
    NumeroComprobante: (number++).toString(),
    NumeroAutomatico: false,
    Cliente: "VX_C",
    FechaOrigen: "2026-10-28",
    CajaSaldo: box.IDTabla,
    Concepto: null,
    ImporteEfectivo: "0.00",
    ImporteACuenta: total,
    Observacion: null,
    Afectaciones: [],
    Valores,
  });
  const transfer = (Importe: string, Referencia: string) => ({
    Tipo: "TRANSFERENCIA" as const,
    BancoCuenta: "VX_ACC",
    Importe,
    Referencia,
  });
  const cheque = (
    Numero: string,
    Importe: string,
    Tipo: "PROPIO" | "TERCERO" = "TERCERO",
  ) => ({
    Tipo,
    Banco: "VX_B",
    BancoCuenta: Tipo === "PROPIO" ? "VX_ACC" : null,
    CuentaLibradora: Tipo === "TERCERO" ? "VX001" : null,
    Numero,
    Librador: "Librador Valores",
    Documento: "123",
    Emision: "2026-10-28",
    Vencimiento: "2026-11-10",
    Importe,
  });
  // Las PK de ambas tablas pueden coincidir. La identidad pública incluye su familia.
  const sameId = BigInt(
    String(
      (
        await rows(
          "SELECT GREATEST(COALESCE((SELECT MAX(IDTabla) FROM CHEQUE),0),COALESCE((SELECT MAX(IDTabla) FROM TRANSFERENCIA),0),100000001)+1000 AS nextId",
        )
      )[0]!.nextId,
    ),
  );
  await pool.query("ALTER TABLE CHEQUE AUTO_INCREMENT=" + sameId);
  await pool.query("ALTER TABLE TRANSFERENCIA AUTO_INCREMENT=" + sameId);
  const received = await cash.create(
    input("VX_COBRO", "100.00", [
      cheque("2", "10.00"),
      cheque("10", "30.00"),
      transfer("60.00", "VX_%literal"),
    ]),
    user,
    randomUUID(),
  );
  const third = received.valores.find(
    (v) => v.Tipo === "TERCERO" && v.Numero === "2",
  )!;
  const firstTransfer = received.valores.find(
    (v) => v.Tipo === "TRANSFERENCIA",
  )!;
  assert.equal(third.IDTabla, firstTransfer.IDTabla);
  const paid = await cash.create(
    input("VX_PAGO", "35.00", [
      { Tipo: "CARTERA", Cheque: third.IDTabla },
      cheque("999999999999999999999999999999", "5.00", "PROPIO"),
      transfer("20.00", "VX_PAGO_TRANSFER"),
    ]),
    user,
    randomUUID(),
  );
  const annulled = await cash.create(
    input("VX_COBRO", "50.00", [transfer("50.00", "VX_ANULADA")]),
    user,
    randomUUID(),
  );
  await cash.annul(
    annulled.registro.IDTabla,
    {
      CajaSaldo: box.IDTabla,
      Motivo: "Corrección registral",
      ConfirmarCorreccionBancaria: true,
    },
    annulled.version,
    user,
    randomUUID(),
  );
  const original = await cash.create(
    input("VX_COBRO", "7.00", [transfer("7.00", "VX_REVERTIDA")]),
    user,
    randomUUID(),
  );
  await cash.close(
    box.IDTabla,
    { SaldoContado: "100.00", Observacion: null },
    user,
    randomUUID(),
  );
  const nextBox = await cash.open(
    { Caja: "VX_BOX", SaldoInicial: "0.00" },
    user,
    randomUUID(),
  );
  const reversed = await cash.reverse(
    original.registro.IDTabla,
    { CajaSaldo: nextBox.IDTabla, Motivo: "Reversión de prueba" },
    original.version,
    user,
    randomUUID(),
  );
  // Incluso sin caja abierta debe ser posible consultar todos los valores.
  await cash.close(
    nextBox.IDTabla,
    { SaldoContado: "0.00", Observacion: null },
    user,
    randomUUID(),
  );
  await pool.query("UPDATE BANCO SET Activo=0 WHERE Codigo='VX_B'");
  await pool.query("UPDATE BANCOCUENTA SET Activo=0 WHERE Codigo='VX_ACC'");
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    values: createValuesStore(pool),
    cashMovement: cash,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });
  const login = async (role: string) => {
    const response = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({
        email: role + "-values@example.invalid",
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
    reader = await login("VX_READER");
  const req = (path: string, method = "GET", as = reader) =>
    fetch(base + path, { method, headers: { Cookie: as.cookie } });
  const good = async <T>(response: Response): Promise<T> => {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<T>;
  };
  const list = (query = "") =>
    req("/valores?Banco=VX_B" + query).then((r) => good<ValueList>(r));
  const detail = (family: string, id: string) =>
    req(`/valores/${family}/${id}`).then((r) => good<ValueRecordDetail>(r));
  const tables = [
    "CHEQUE",
    "CHEQUEEVENTO",
    "TRANSFERENCIA",
    "BANCOMOVIMIENTO",
    "CAJAMOVIMIENTO",
    "CAJASALDO",
    "CUENTACORRIENTE",
    "CAJAMOVIMIENTOAFECTACION",
    "NUMERACION",
    "AUDITORIA",
    "SOLICITUD",
  ];
  const before = await Promise.all(
    tables.map((table) => rows(`SELECT * FROM ${table} ORDER BY IDTabla`)),
  );
  await t.test(
    "requiere sesión; lector y administrador consultan sin caja abierta ni cambios",
    async () => {
      assert.equal((await fetch(base + "/valores")).status, 401);
      assert.equal(
        (await fetch(base + `/valores/CHEQUE/${third.IDTabla}`)).status,
        401,
      );
      const a = await list();
      const b = await good<ValueList>(
        await req("/valores?Banco=VX_B", "GET", admin),
      );
      assert.deepEqual(a, b);
      assert.equal(a.total, 8);
      assert.equal(a.registros.filter((v) => v.Familia === "CHEQUE").length, 3);
      assert.equal(new Set(a.registros.map((v) => v.Clave)).size, 8);
    },
  );
  await t.test(
    "un cheque endosado aparece una vez y mantiene su recepción, endoso y ambas operaciones",
    async () => {
      const d = await detail("CHEQUE", third.IDTabla);
      assert.equal(d.registro.Estado, "ENDOSADO");
      assert.equal(d.registro.OrigenCajaMovimiento, received.registro.IDTabla);
      assert.deepEqual(
        d.historial.map((e) => e.Tipo),
        ["RECEPCION", "ENDOSO"],
      );
      assert.deepEqual(
        d.operaciones.map((m) => m.IDTabla),
        [received.registro.IDTabla, paid.registro.IDTabla],
      );
      for (const op of d.operaciones)
        assert.equal(
          (await good<CashDetail>(await req("/caja-movimiento/" + op.IDTabla)))
            .registro.IDTabla,
          op.IDTabla,
        );
      assert.equal(d.datos.CuentaLibradora, "VX001");
      assert.equal(d.registro.Fecha, "2026-10-28");
      assert.equal(d.registro.Vencimiento, "2026-11-10");
    },
  );
  await t.test(
    "las claves distinguen cheque y transferencia con el mismo IDTabla",
    async () => {
      const ch = await detail("CHEQUE", third.IDTabla),
        tr = await detail("TRANSFERENCIA", third.IDTabla);
      assert.notEqual(ch.registro.Clave, tr.registro.Clave);
      assert.equal(tr.registro.Numero, "VX_%literal");
      assert.equal(ch.registro.Numero, "2");
    },
  );
  await t.test(
    "filtra tipo, estado, banco, cuenta, emisión y vencimiento sin excluir maestros inactivos",
    async () => {
      assert.equal((await list("&Tipo=PROPIO")).total, 1);
      assert.equal((await list("&Tipo=TERCERO&Estado=CARTERA")).total, 1);
      assert.equal((await list("&BancoCuenta=VX_ACC")).total, 6);
      assert.equal(
        (await list("&Desde=2026-10-28&Hasta=2026-10-28")).total,
        reversed.registro.FechaOrigen === "2026-10-28" ? 8 : 7,
      );
      assert.equal(
        (await list("&Desde=2026-10-29")).total,
        reversed.registro.FechaOrigen >= "2026-10-29" ? 1 : 0,
        "La contrapartida de reversión tiene fecha actual",
      );
      assert.equal(
        (await list("&FechaPor=VENCIMIENTO&Desde=2026-11-10&Hasta=2026-11-10"))
          .total,
        3,
      );
      assert.equal(
        (await list("&FechaPor=VENCIMIENTO&Tipo=TRANSFERENCIA")).total,
        0,
      );
    },
  );
  await t.test(
    "búsqueda literal parametrizada y orden global numérico/monetario con paginación",
    async () => {
      assert.equal((await list("&q=" + encodeURIComponent("_%"))).total, 1);
      assert.equal((await list("&q=VX_C")).total, 8);
      assert.equal((await list("&q=Librador")).total, 3);
      assert.equal(
        (await list("&q=" + encodeURIComponent("Cliente de Valores"))).total,
        8,
      );
      assert.equal(
        (await list("&q=" + encodeURIComponent("' OR 1=1 --"))).total,
        0,
      );
      const cheques = await list(
        "&Tipo=TERCERO&orden=Numero&direccion=asc&limite=1",
      );
      const next = await list(
        "&Tipo=TERCERO&orden=Numero&direccion=asc&limite=1&pagina=2",
      );
      assert.equal(cheques.total, 2);
      assert.equal(cheques.registros[0]!.Numero, "2");
      assert.equal(next.registros[0]!.Numero, "10");
      const money = await list("&orden=Importe&direccion=desc&limite=2");
      assert.deepEqual(
        money.registros.map((v) => v.Importe),
        ["60.00", "50.00"],
      );
      const packed = received.registro.NumeroComprobanteTexto;
      assert.equal((await list("&q=" + encodeURIComponent(packed))).total, 3);
    },
  );
  await t.test(
    "transferencias anuladas y revertidas conservan historial y contrapartida sin confundir estados de cheques",
    async () => {
      const a = await detail("TRANSFERENCIA", annulled.valores[0]!.IDTabla);
      assert.equal(a.registro.Estado, "ANULADO");
      assert.deepEqual(
        a.historial.map((e) => e.Tipo),
        ["REGISTRO", "ANULACION"],
      );
      assert.equal(a.historial[1]!.Observacion, "Corrección registral");
      const r = await detail("TRANSFERENCIA", original.valores[0]!.IDTabla);
      assert.equal(r.registro.Estado, "REVERTIDO");
      assert.equal(r.historial.at(-1)!.Tipo, "REVERSION");
      assert.equal(r.historial.at(-1)!.Observacion, "Reversión de prueba");
      assert.ok(
        r.operaciones.some((op) => op.IDTabla === reversed.registro.IDTabla),
      );
      const counterpart = await detail(
        "TRANSFERENCIA",
        reversed.valores.find((v) => v.Tipo === "TRANSFERENCIA")!.IDTabla,
      );
      assert.equal(counterpart.registro.Estado, "CONFIRMADO");
      assert.equal(counterpart.historial[0]!.Tipo, "REGISTRO_REVERSION");
      assert.ok(
        counterpart.operaciones.some(
          (op) => op.IDTabla === original.registro.IDTabla,
        ),
      );
      assert.equal(
        (await list("&Tipo=TRANSFERENCIA&Estado=REVERTIDO")).total,
        1,
      );
    },
  );
  await t.test(
    "rechaza identificadores/filtros/orden inválidos y todas las escrituras",
    async () => {
      for (const path of [
        "/valores?orden=Importe;DROP&direccion=asc",
        "/valores?orden=NoExiste&direccion=desc",
        "/valores?direccion=asc",
        "/valores?Desde=2026-02-31",
        "/valores?Desde=2026-12-31&Hasta=2026-01-01",
        "/valores?Tipo=INVENTADO",
        "/valores/CHEQUE/0",
        "/valores/TABLA/1",
        "/valores/CHEQUE/9223372036854775808",
      ])
        assert.equal((await req(path)).status, 400, path);
      assert.equal(
        (await req("/valores/CHEQUE/9223372036854775807")).status,
        404,
      );
      for (const as of [reader, admin])
        for (const method of ["POST", "PUT", "PATCH", "DELETE"])
          assert.equal(
            (await req("/valores/CHEQUE/" + third.IDTabla, method, as)).status,
            405,
          );
    },
  );
  await t.test(
    "detalle y búsqueda conservan resultados con las collations de MySQL/MariaDB y sentencias preparadas",
    async () => {
      const { pool: detailPool } = createDatabase(config);
      const store = createValuesStore(detailPool);
      const targets = [
        ["CHEQUE", third.IDTabla],
        ["TRANSFERENCIA", firstTransfer.IDTabla],
        ["TRANSFERENCIA", annulled.valores[0]!.IDTabla],
        ["TRANSFERENCIA", original.valores[0]!.IDTabla],
      ] as const;
      try {
        const expected = await Promise.all(
          targets.map(([family, id]) => detail(family, id)),
        );
        const names = (
          await rows("SHOW COLLATION WHERE Charset='utf8mb4'")
        ).map((r) => String(r.Collation));
        const queries = [
          { Banco: "VX_B", q: "Valores" },
          { Banco: "VX_B", Tipo: "TRANSFERENCIA", Estado: "CONFIRMADO" },
          { Banco: "VX_B", Estado: "REVERTIDO" },
          { Banco: "VX_B", FechaPor: "VENCIMIENTO" },
        ].map((query) => valueQuery.parse(query));
        const expectedLists = await Promise.all(
          queries.map((query) => createValuesStore(pool).list(query)),
        );
        for (const collation of [
          "utf8mb4_general_ci",
          "utf8mb4_unicode_ci",
          "utf8mb4_bin",
          "utf8mb4_uca1400_ai_ci",
          "utf8mb4_0900_ai_ci",
        ].filter((name) => names.includes(name))) {
          await detailPool.query("SET NAMES utf8mb4 COLLATE " + collation);
          for (let i = 0; i < targets.length; i++) {
            const [family, id] = targets[i]!;
            assert.deepEqual(
              await store.detail(family, id),
              expected[i],
              collation + " " + family,
            );
          }
          for (let i = 0; i < queries.length; i++)
            assert.deepEqual(
              await store.list(queries[i]!),
              expectedLists[i],
              collation,
            );
        }
      } finally {
        await detailPool.end();
      }
    },
  );
  await t.test(
    "consultar listas, propiedades e historial no modifica saldos, instrumentos, numeradores ni auditoría",
    async () => {
      for (let i = 0; i < tables.length; i++)
        assert.deepEqual(
          await rows(`SELECT * FROM ${tables[i]} ORDER BY IDTabla`),
          before[i],
          tables[i],
        );
    },
  );
});
