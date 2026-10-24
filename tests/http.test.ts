import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/app.js';

test('HTTP: disponibilidad, fallo de dependencia, rutas API y navegación SPA', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'erp-web-test-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><html lang="es"><title>ERP prueba SPA</title></html>');
  let databaseAvailable = true;
  const server = createApp({
    webDist: directory,
    checkDatabase: async () => { if (!databaseAvailable) throw new Error('detalle interno que no debe salir'); },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  await t.test('la API responde y no anuncia Express', async () => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'erp-quiniela-api' });
  });
  await t.test('un fallo de MySQL devuelve 503 sin datos internos', async () => {
    databaseAvailable = false;
    const response = await fetch(`${base}/api/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error', database: 'unavailable' });
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    databaseAvailable = true;
  });
  await t.test('las rutas de API inexistentes no devuelven el HTML de React', async () => {
    for (const path of ['/api', '/api/no-existe']) {
      const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    }
  });
  await t.test('las rutas de navegación sirven la SPA; los archivos ausentes dan 404', async () => {
    const response = await fetch(`${base}/cuenta-corriente`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /ERP prueba SPA/);
    assert.equal((await fetch(`${base}/assets/no-existe.js`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/%2eenv`)).status, 404);
  });
  await t.test('un cuerpo JSON inválido produce 400 sin mostrar el error del parser', async () => {
    const response = await fetch(`${base}/api/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Solicitud inválida.' });
  });
});
