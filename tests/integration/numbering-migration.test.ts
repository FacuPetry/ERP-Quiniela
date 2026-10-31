import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  databaseOptions,
  readConfig,
  projectRoot,
} from "../../apps/api/src/config/env.js";
import { inspectSharedNumberingMigration } from "../../apps/api/src/database/shared-numbering-preflight.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import {
  inspectNumberingMigration,
  NumberingMigrationError,
} from "../../apps/api/src/database/numbering-preflight.js";

test("Migraciones financieras: conservan datos y detienen conversiones ambiguas antes del DDL", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  assert.equal(config.DB_HOST, "127.0.0.1");
  const connection = await mysql.createConnection(databaseOptions(config));
  const directory = await mkdtemp("/tmp/erp-old-numbering-");
  await mkdir(join(directory, "meta"));
  const journal = JSON.parse(
    await readFile(
      join(projectRoot, "database/migrations/meta/_journal.json"),
      "utf8",
    ),
  );
  journal.entries = journal.entries.filter(
    (entry: { idx: number }) => entry.idx < 2,
  );
  await writeFile(
    join(directory, "meta/_journal.json"),
    JSON.stringify(journal),
  );
  for (const entry of journal.entries)
    await copyFile(
      join(projectRoot, "database/migrations", entry.tag + ".sql"),
      join(directory, entry.tag + ".sql"),
    );
  const priorDirectory = await mkdtemp("/tmp/erp-prior-shared-");
  await mkdir(join(priorDirectory, "meta"));
  const priorJournal = JSON.parse(
    await readFile(
      join(projectRoot, "database/migrations/meta/_journal.json"),
      "utf8",
    ),
  );
  priorJournal.entries = priorJournal.entries.filter(
    (e: { idx: number }) => e.idx < 6,
  );
  await writeFile(
    join(priorDirectory, "meta/_journal.json"),
    JSON.stringify(priorJournal),
  );
  for (const entry of priorJournal.entries)
    await copyFile(
      join(projectRoot, "database/migrations", entry.tag + ".sql"),
      join(priorDirectory, entry.tag + ".sql"),
    );
  t.after(() => rm(priorDirectory, { recursive: true, force: true }));
  const sharedDirectory = await mkdtemp("/tmp/erp-with-numbering-history-");
  await mkdir(join(sharedDirectory, "meta"));
  const sharedJournal = JSON.parse(
    await readFile(
      join(projectRoot, "database/migrations/meta/_journal.json"),
      "utf8",
    ),
  );
  sharedJournal.entries = sharedJournal.entries.filter(
    (e: { idx: number }) => e.idx < 7,
  );
  await writeFile(
    join(sharedDirectory, "meta/_journal.json"),
    JSON.stringify(sharedJournal),
  );
  for (const entry of sharedJournal.entries)
    await copyFile(
      join(projectRoot, "database/migrations", entry.tag + ".sql"),
      join(sharedDirectory, entry.tag + ".sql"),
    );
  t.after(() => rm(sharedDirectory, { recursive: true, force: true }));
  async function reset() {
    // Solo la base efímera creada por scripts/integration.mjs. Nunca se usa configuración del alojamiento.
    const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES");
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    try {
      for (const row of tables) {
        const table = String(Object.values(row)[0]);
        assert.match(table, /^[A-Za-z0-9_]+$/);
        await connection.query("DROP TABLE `" + table + "`");
      }
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS=1");
    }
  }
  t.after(async () => {
    try {
      await reset();
    } finally {
      await connection.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
  async function old() {
    await reset();
    await migrate(drizzle(connection), { migrationsFolder: directory });
    await connection.query(
      "INSERT INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador')",
    );
    await connection.query(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Fixture','fixture@example.invalid','sin-acceso','ADMIN','2026-10-25')",
    );
    await connection.query(
      "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('J','Jugador')",
    );
    await connection.query(
      "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('00002','Cliente preservado','J')",
    );
    await connection.query(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES ('ING','Ingreso','CUENTACORRIENTE','COBRAR','DEUDA','NOAPLICA')",
    );
    await connection.query(
      "INSERT INTO NUMERACION (Comprobante,Serie,ProximoNumero) VALUES ('ING','1',26)",
    );
    for (const [Numero, Numeracion, Estado] of [
      [25, "100000001", "CONFIRMADO"],
      [20, "100000001", "ANULADO"],
      [7, null, "CONFIRMADO"],
      [null, null, "CONFIRMADO"],
    ])
      await connection.query(
        "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,Numeracion,Numero,FechaOrigen,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          "00002",
          "ING",
          Numeracion,
          Numero,
          "2026-10-25",
          "COBRAR",
          "DEUDA",
          "10.25",
          "Conservar observaciones",
          Estado,
          "100000001",
          "2026-10-25",
        ],
      );
    await connection.query(
      "INSERT INTO CAJAMOVIMIENTO (Comprobante,Numeracion,Numero,FechaOrigen,ImporteTotal,Sentido,Estado,Usuario,CreadoEn) VALUES ('ING',100000001,24,'2026-10-25',10.25,'INGRESO','CONFIRMADO',100000001,'2026-10-25')",
    );
    await connection.query(
      "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,CajaMovimiento,Numeracion,Numero,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('00002','ING',100000001,100000001,24,'2026-10-25','COBRAR','CREDITO',10.25,'CONFIRMADO',100000001,'2026-10-25')",
    );
    await connection.query(
      "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe) VALUES (100000001,100000001,5.00)",
    );
    await connection.query(
      "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Detalle) VALUES (100000001,'ALTA','CUENTACORRIENTE','100000001','2026-10-25',?)",
      [JSON.stringify({ Numero: "25", Numeracion: "100000001" })],
    );
  }
  await t.test(
    "convierte números, conserva claves, importes, anulados, NULL e historia y no repite la conversión",
    async () => {
      await old();
      const [before] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CUENTACORRIENTE ORDER BY IDTabla",
      );
      assert.deepEqual(await inspectNumberingMigration(connection), []);
      await applyMigrations(config);
      const [after] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CUENTACORRIENTE ORDER BY IDTabla",
      );
      assert.deepEqual(
        after.map((r) => r.NumeroComprobante),
        ["100000025", "100000020", "7", null, "100000024"],
      );
      assert.ok(after.every((row) => row.Concepto === null));
      assert.ok(after.every((row) => row.ChequeEvento === null));
      const [vouchers] = await connection.query<RowDataPacket[]>(
        "SELECT Codigo,Descripcion,EsReversion,ComprobanteReversion FROM COMPROBANTE",
      );
      assert.deepEqual(
        vouchers.map((v) => ({ ...v })),
        [
          {
            Codigo: "ING",
            Descripcion: "Ingreso",
            EsReversion: 0,
            ComprobanteReversion: null,
          },
        ],
      );
      for (let i = 0; i < before.length; i++)
        for (const [key, value] of Object.entries(before[i]!))
          if (!["Numero", "Numeracion"].includes(key))
            assert.deepEqual(after[i]![key], value, key);
      const [num] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM NUMERACION",
      );
      assert.equal(String(num[0]!.ProximoNumero), "100000026");
      assert.ok(!Object.hasOwn(num[0]!, "Serie"));
      assert.equal(num[0]!.Codigo, "ING");
      assert.equal(num[0]!.Caja, null);
      assert.ok(!Object.hasOwn(num[0]!, "Comprobante"));
      const [uses] = await connection.query<RowDataPacket[]>(
        "SHOW TABLES LIKE 'NUMERACIONUSO'",
      );
      assert.equal(uses.length, 0);
      const [assigned] = await connection.query<RowDataPacket[]>(
        "SELECT Numerador FROM COMPROBANTE WHERE Codigo='ING'",
      );
      assert.equal(assigned[0]!.Numerador, "ING");
      const [cash] = await connection.query<RowDataPacket[]>(
        "SELECT NumeroComprobante FROM CAJAMOVIMIENTO",
      );
      assert.equal(String(cash[0]!.NumeroComprobante), "100000024");
      const [cashExtra] = await connection.query<RowDataPacket[]>(
        "SELECT ImporteACuenta,CajaMovimientoOrigen FROM CAJAMOVIMIENTO",
      );
      assert.equal(cashExtra[0]!.ImporteACuenta, "5.25");
      assert.equal(cashExtra[0]!.CajaMovimientoOrigen, null);
      const [allocationExtra] = await connection.query<RowDataPacket[]>(
        "SELECT Usuario,CreadoEn FROM CAJAMOVIMIENTOAFECTACION",
      );
      assert.equal(String(allocationExtra[0]!.Usuario), "100000001");
      assert.ok(allocationExtra[0]!.CreadoEn);

      const [affected] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CAJAMOVIMIENTOAFECTACION",
      );
      assert.equal(affected.length, 1);
      assert.equal(affected[0]!.Importe, "5.00");
      const [audit] = await connection.query<RowDataPacket[]>(
        "SELECT Detalle FROM AUDITORIA",
      );
      const detail =
        typeof audit[0]!.Detalle === "string"
          ? JSON.parse(audit[0]!.Detalle)
          : audit[0]!.Detalle;
      assert.equal(detail.Numero, "25");
      await applyMigrations(config);
      const [same] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CUENTACORRIENTE ORDER BY IDTabla",
      );
      assert.deepEqual(same, after);
      await assert.rejects(
        connection.query(
          "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,NumeroComprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('00002','ING',100000025,'2026-10-25','COBRAR','DEUDA',10,'CONFIRMADO',100000001,'2026-10-25')",
        ),
      );
      const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES");
      assert.equal(tables.length, 22);
    },
  );
  await t.test(
    "eliminar el historial conserva configuraciones, números, importes, afectaciones y auditoría de una base ya migrada",
    async () => {
      await old();
      await migrate(drizzle(connection), { migrationsFolder: sharedDirectory });
      const [uses] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM NUMERACIONUSO",
      );
      assert.equal(uses.length, 4, "La base anterior contiene consumos reales");
      await connection.query(
        "UPDATE COMPROBANTE SET Numerador=NULL WHERE Codigo='ING'",
      );
      const tables = [
        "NUMERACION",
        "COMPROBANTE",
        "CUENTACORRIENTE",
        "CAJAMOVIMIENTO",
        "CAJAMOVIMIENTOAFECTACION",
        "AUDITORIA",
      ];
      const before = await Promise.all(
        tables.map(
          async (table) =>
            (
              await connection.query<RowDataPacket[]>(
                `SELECT * FROM ${table} ORDER BY ${table === "COMPROBANTE" ? "Codigo" : "IDTabla"}`,
              )
            )[0],
        ),
      );
      await applyMigrations(config);
      assert.equal(
        (
          await connection.query<RowDataPacket[]>(
            "SHOW TABLES LIKE 'NUMERACIONUSO'",
          )
        )[0].length,
        0,
      );
      await applyMigrations(config);
      for (let index = 0; index < tables.length; index++) {
        const table = tables[index]!;
        const [after] = await connection.query<RowDataPacket[]>(
          `SELECT * FROM ${table} ORDER BY ${table === "COMPROBANTE" ? "Codigo" : "IDTabla"}`,
        );
        assert.deepEqual(
          after,
          table === "CUENTACORRIENTE"
            ? before[index]!.map((row) => ({ ...row, ChequeEvento: null }))
            : before[index],
          table,
        );
      }
      await connection.query("DELETE FROM NUMERACION WHERE Codigo='ING'");
      assert.equal(
        (
          await connection.query<RowDataPacket[]>(
            "SELECT * FROM CUENTACORRIENTE",
          )
        )[0].length,
        5,
      );
    },
  );
  await t.test(
    "completa la migración si el historial ya se eliminó antes de registrar el DDL",
    async () => {
      await old();
      await migrate(drizzle(connection), { migrationsFolder: sharedDirectory });
      await connection.query("DROP TABLE NUMERACIONUSO");
      assert.deepEqual(await inspectSharedNumberingMigration(connection), []);
      await applyMigrations(config);
      await applyMigrations(config);
      assert.equal(
        (
          await connection.query<RowDataPacket[]>("SELECT * FROM NUMERACION")
        )[0][0]!.ProximoNumero,
        "100000026",
      );
    },
  );
  await t.test(
    "rechaza múltiples numeradores sin elegir uno ni borrar filas",
    async () => {
      await old();
      await connection.query(
        "INSERT INTO NUMERACION (Comprobante,Serie,ProximoNumero) VALUES ('ING','2',1)",
      );
      await assert.rejects(applyMigrations(config), NumberingMigrationError);
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM NUMERACION",
      );
      assert.equal(Number(rows[0]!.total), 2);
      const [columns] = await connection.query<RowDataPacket[]>(
        "SHOW COLUMNS FROM CUENTACORRIENTE LIKE 'NumeroComprobante'",
      );
      assert.equal(columns.length, 0);
    },
  );
  await t.test(
    "rechaza series alfabéticas, correlativos fuera de rango y duplicados convertidos",
    async () => {
      for (const mutation of [
        "UPDATE NUMERACION SET Serie='A'",
        "UPDATE NUMERACION SET ProximoNumero=100000000",
        "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,Numero,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('00002','ING',7,'2026-10-25','COBRAR','DEUDA',10,'CONFIRMADO',100000001,'2026-10-25')",
      ]) {
        await old();
        await connection.query(mutation);
        assert.ok((await inspectNumberingMigration(connection)).length);
        await assert.rejects(applyMigrations(config), NumberingMigrationError);
        const [columns] = await connection.query<RowDataPacket[]>(
          "SHOW COLUMNS FROM CUENTACORRIENTE LIKE 'NumeroComprobante'",
        );
        assert.equal(columns.length, 0);
      }
    },
  );
  await t.test(
    "detecta DDL incompleto y no vuelve a combinar números automáticamente",
    async () => {
      await old();
      await connection.query(
        "ALTER TABLE CUENTACORRIENTE ADD NumeroComprobante bigint unsigned",
      );
      await assert.rejects(applyMigrations(config), /incompleta/);
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT ProximoNumero FROM NUMERACION",
      );
      assert.equal(String(rows[0]!.ProximoNumero), "26");
    },
  );
  await t.test(
    "Caja: rechaza afectaciones inválidas, instrumentos duplicados y DDL parcial antes de alterar tablas",
    async () => {
      await old();
      await connection.query("UPDATE CAJAMOVIMIENTOAFECTACION SET Importe=20");
      await assert.rejects(applyMigrations(config), /afectaciones superiores/);
      let [fields] = await connection.query<RowDataPacket[]>(
        "SHOW COLUMNS FROM CAJAMOVIMIENTO LIKE 'ImporteACuenta'",
      );
      assert.equal(fields.length, 0);
      await old();
      await connection.query(
        "INSERT INTO BANCO (Codigo,Nombre) VALUES ('B','Banco')",
      );
      await connection.query(
        "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('CTA','B','Cuenta','ERP')",
      );
      for (let i = 0; i < 2; i++)
        await connection.query(
          "INSERT INTO CHEQUE (Comprobante,Tipo,Numero,Banco,BancoCuenta,Emision,Vencimiento,Importe,Estado,Usuario,CreadoEn) VALUES ('ING','PROPIO','123','B','CTA','2026-10-25','2026-10-25',10,'EMITIDO',100000001,'2026-10-25')",
        );
      await assert.rejects(applyMigrations(config), /cheques duplicados/);
      [fields] = await connection.query<RowDataPacket[]>(
        "SHOW COLUMNS FROM CHEQUE LIKE 'CuentaLibradora'",
      );
      assert.equal(fields.length, 0);
      await old();
      await connection.query(
        "ALTER TABLE CAJAMOVIMIENTO ADD CajaMovimientoOrigen bigint",
      );
      await assert.rejects(
        applyMigrations(config),
        /Caja movimiento incompleta/,
      );
    },
  );
  await t.test(
    "numeradores compartidos: detecta duplicados reales antes del DDL y conserva filas",
    async () => {
      await old();
      await migrate(drizzle(connection), { migrationsFolder: priorDirectory });
      await connection.query(
        "UPDATE CAJAMOVIMIENTO SET NumeroComprobante=100000025",
      );
      const [before] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CAJAMOVIMIENTO",
      );
      assert.match(
        (await inspectSharedNumberingMigration(connection)).join(" "),
        /duplicadas/,
      );
      await assert.rejects(applyMigrations(config), /duplicadas/);
      const [fields] = await connection.query<RowDataPacket[]>(
        "SHOW COLUMNS FROM NUMERACION LIKE 'Codigo'",
      );
      assert.equal(fields.length, 0);
      const [after] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM CAJAMOVIMIENTO",
      );
      assert.deepEqual(after, before);
    },
  );
  await t.test(
    "numeradores compartidos: un DDL parcial no se reintenta ni elimina la relación anterior",
    async () => {
      await old();
      await migrate(drizzle(connection), { migrationsFolder: priorDirectory });
      await connection.query("ALTER TABLE NUMERACION ADD Codigo varchar(20)");
      await assert.rejects(applyMigrations(config), /incompleta/);
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT Comprobante,ProximoNumero FROM NUMERACION",
      );
      assert.equal(rows[0]!.Comprobante, "ING");
      assert.equal(String(rows[0]!.ProximoNumero), "100000026");
    },
  );
});
