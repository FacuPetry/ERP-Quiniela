import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { createApp } from '../../apps/api/src/app.js';
import { databaseOptions, readConfig } from '../../apps/api/src/config/env.js';
import { applyMigrations } from '../../apps/api/src/database/migrate.js';
import { createDatabase } from '../../apps/api/src/database/client.js';
import { rol, usuario } from '../../apps/api/src/database/schema.js';
import { createInitialAdmin, InitialAdminError } from '../../apps/api/src/auth/bootstrap.js';
import { createAuthService } from '../../apps/api/src/auth/service.js';
import { createAuthStore } from '../../apps/api/src/auth/store.js';
import { tokenHash, verifyPassword } from '../../apps/api/src/auth/crypto.js';
import type { SessionResponse } from '@erp/shared';

test('Integración con MySQL/MariaDB real en una base efímera', async t => {
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

  const password = randomBytes(24).toString('base64url');
  await t.test('dos altas simultáneas crean un solo administrador con hash y auditoría', async () => {
    const input = { nombre: 'Administrador de prueba', email: 'admin@example.invalid', password };
    const attempts = await Promise.allSettled([createInitialAdmin(pool, input), createInitialAdmin(pool, input)]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = attempts.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof InitialAdminError);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT IDTabla, ClaveHash FROM USUARIO');
    assert.equal(rows.length, 1); assert.equal(String(rows[0]?.IDTabla), '100000001');
    assert.ok(await verifyPassword(password, rows[0]!.ClaveHash));
    const [audit] = await connection.query<RowDataPacket[]>('SELECT Accion FROM AUDITORIA');
    assert.equal(audit[0]?.Accion, 'ALTA_ADMIN_INICIAL');
  });

  await t.test('Drizzle inserta BIGINT correctamente y las FK rechazan referencias inexistentes', async () => {
    await db.insert(rol).values({ Codigo: 'OPERADOR', Nombre: 'Operador' });
    await db.insert(usuario).values({ Nombre: 'Prueba', Email: 'prueba@example.invalid', ClaveHash: 'solo-fixture-sin-acceso', Rol: 'OPERADOR', CreadoEn: new Date() });
    const users = await db.select().from(usuario);
    assert.equal(users.find(user => user.Email === 'prueba@example.invalid')?.IDTabla, 100000002n);
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

  await t.test('ingreso, recarga, desactivación y cierre usan SESION real y sobreviven a otra instancia', async () => {
    const store = createAuthStore(pool);
    const server = createApp({ checkDatabase: async () => { await pool.query('SELECT 1'); }, auth: createAuthService(store) }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api/auth`;
      const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ERP-Request': '1' }, body: JSON.stringify({ email: 'admin@example.invalid', password }) });
      assert.equal(login.status, 200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      const rawToken = cookie.split('=')[1]!;
      const session = await login.json() as SessionResponse;
      const [rows] = await connection.query<RowDataPacket[]>('SELECT TokenHash FROM SESION');
      assert.equal(rows[0]?.TokenHash, tokenHash(rawToken));
      assert.ok(await createAuthService(createAuthStore(pool)).current(rawToken));
      assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 200);
      await connection.execute('UPDATE USUARIO SET Activo = 0 WHERE Email = ?', ['admin@example.invalid']);
      assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
      await connection.execute('UPDATE USUARIO SET Activo = 1 WHERE Email = ?', ['admin@example.invalid']);
      await connection.execute('UPDATE ROL SET Activo = 0 WHERE Codigo = ?', ['ADMIN']);
      assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
      await connection.execute('UPDATE ROL SET Activo = 1 WHERE Codigo = ?', ['ADMIN']);
      const logout = await fetch(`${base}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ERP-Request': '1', Cookie: cookie, 'X-CSRF-Token': session.csrfToken }, body: '{}' });
      assert.equal(logout.status, 204);
      assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
      const [revoked] = await connection.query<RowDataPacket[]>('SELECT RevocadoEn FROM SESION');
      assert.ok(revoked[0]?.RevocadoEn instanceof Date);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
