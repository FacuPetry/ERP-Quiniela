import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { createApp } from '../../apps/api/src/app.js';
import { databaseOptions, readConfig } from '../../apps/api/src/config/env.js';
import { applyMigrations } from '../../apps/api/src/database/migrate.js';
import { createDatabase } from '../../apps/api/src/database/client.js';
import { rol, usuario } from '../../apps/api/src/database/schema.js';

test('Integración con MySQL real en una base efímera', async t => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, '1', 'Ejecutar npm run test:integration para crear la base aislada.');
  const config = readConfig();
  assert.equal(config.DB_NAME, 'erp_quiniela_test');
  assert.equal(config.DB_HOST, '127.0.0.1');
  const connection = await mysql.createConnection(databaseOptions(config));
  const { pool, db } = createDatabase(config);
  t.after(async () => { await pool.end(); await connection.end(); });
  await applyMigrations(config);

  await t.test('crea únicamente las 21 tablas acordadas más el historial técnico', async () => {
    const [rows] = await connection.query<RowDataPacket[]>('SHOW TABLES');
    const actual = rows.map(row => Object.values(row)[0]).sort();
    const expected = ['AUDITORIA', 'BANCO', 'BANCOCUENTA', 'BANCOMOVIMIENTO', 'CAJA', 'CAJAMOVIMIENTO',
      'CAJAMOVIMIENTOAFECTACION', 'CAJASALDO', 'CHEQUE', 'CHEQUEEVENTO', 'CLIENTE', 'CLIENTETIPO',
      'COMPROBANTE', 'CONCEPTO', 'CUENTACORRIENTE', 'NUMERACION', 'ROL', 'SESION', 'SOLICITUD',
      'TRANSFERENCIA', 'USUARIO', '__drizzle_migrations'].sort();
    assert.deepEqual(actual, expected);
    const [engines] = await connection.query<RowDataPacket[]>("SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
    assert.ok(engines.every(row => row.engine === 'InnoDB'));
  });

  await t.test('todas las PK IDTabla comienzan en 100000001', async () => {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT TABLE_NAME AS name, AUTO_INCREMENT AS nextId FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations' AND AUTO_INCREMENT IS NOT NULL");
    assert.equal(rows.length, 13);
    for (const row of rows) assert.equal(String(row.nextId), '100000001', row.name);
  });

  await t.test('repetir migraciones conserva los datos y no repite el historial', async () => {
    await connection.execute('INSERT INTO CLIENTETIPO (Codigo, Descripcion) VALUES (?, ?)', ['CLIENTE', 'Cliente de prueba']);
    const [before] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM __drizzle_migrations');
    await applyMigrations(config);
    const [after] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM __drizzle_migrations');
    assert.equal(after[0]?.count, before[0]?.count);
    const [data] = await connection.query<RowDataPacket[]>('SELECT Codigo FROM CLIENTETIPO');
    assert.equal(data[0]?.Codigo, 'CLIENTE');
  });

  await t.test('Drizzle inserta BIGINT correctamente y las FK rechazan referencias inexistentes', async () => {
    await db.insert(rol).values({ Codigo: 'ADMIN', Nombre: 'Administrador' });
    await db.insert(usuario).values({ Nombre: 'Prueba', Email: 'prueba@example.invalid', ClaveHash: 'solo-fixture-sin-acceso', Rol: 'ADMIN', CreadoEn: new Date() });
    const users = await db.select().from(usuario);
    assert.equal(users[0]?.IDTabla, 100000001n);
    await assert.rejects(connection.execute('INSERT INTO CLIENTE (Codigo, ClienteTipo, Nombre) VALUES (?, ?, ?)', ['INVALIDO', 'NO_EXISTE', 'Prueba']), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2');
  });

  await t.test('DECIMAL conserva centavos y una transacción revertida no deja datos', async () => {
    await connection.beginTransaction();
    try {
      await connection.execute('INSERT INTO CLIENTE (Codigo, ClienteTipo, Nombre) VALUES (?, ?, ?)', ['J001', 'CLIENTE', 'Jugador de prueba']);
      await connection.execute('INSERT INTO COMPROBANTE (Codigo, Descripcion, ModuloOrigen, Cuenta, Naturaleza, SentidoFondos) VALUES (?, ?, ?, ?, ?, ?)', ['PR', 'Premio', 'CUENTACORRIENTE', 'PAGAR', 'DEUDA', 'NOAPLICA']);
      await connection.execute('INSERT INTO CUENTACORRIENTE (Cliente, Comprobante, FechaOrigen, Cuenta, Naturaleza, Importe, Estado, Usuario, CreadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ['J001', 'PR', '2026-10-24', 'PAGAR', 'DEUDA', '100000.25', 'CONFIRMADO', '100000001', new Date()]);
      const [rows] = await connection.query<RowDataPacket[]>('SELECT Importe FROM CUENTACORRIENTE');
      assert.equal(rows[0]?.Importe, '100000.25');
    } finally { await connection.rollback(); }
    const [rows] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM CUENTACORRIENTE');
    assert.equal(Number(rows[0]?.count), 0);
  });

  await t.test('la API consulta la base real mediante el pool', async () => {
    const server = createApp({ checkDatabase: async () => { await pool.query('SELECT 1'); } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/ready`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
