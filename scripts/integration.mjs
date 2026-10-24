import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const mysql = require('mysql2/promise');
const image = (await readFile(join(root, 'compose.yaml'), 'utf8')).match(/image: (mysql:[^\s]+)/)?.[1];
if (!image) throw new Error('No se encontró la imagen MySQL fijada en compose.yaml.');
const name = `erp-quiniela-test-${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), 'erp-quiniela-test-'));
const password = randomBytes(24).toString('hex');
let started = false;

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  const environmentFile = join(directory, 'mysql.env');
  await writeFile(environmentFile, [
    'MYSQL_DATABASE=erp_quiniela_test', 'MYSQL_USER=erp',
    `MYSQL_PASSWORD=${password}`, `MYSQL_ROOT_PASSWORD=${randomBytes(24).toString('hex')}`, '',
  ].join('\n'), { mode: 0o600 });
  console.log('Iniciando MySQL aislado para integración; no se utilizará la base de desarrollo o producción.');
  docker(['run', '--detach', '--rm', '--name', name, '--env-file', environmentFile,
    '--publish', '127.0.0.1::3306', image]);
  started = true;
  const port = Number(docker(['port', name, '3306/tcp']).split(':').at(-1));
  if (!Number.isInteger(port) || port < 1) throw new Error('No se obtuvo un puerto de prueba.');
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'erp', password, database: 'erp_quiniela_test', connectTimeout: 1000 });
      await connection.query('SELECT 1');
      await connection.end();
      ready = true;
      break;
    } catch { await delay(1000); }
  }
  if (!ready) throw new Error('MySQL de prueba no estuvo disponible dentro del tiempo previsto.');
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/integration/database.test.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: 'erp_quiniela_test', DB_USER: 'erp', DB_PASSWORD: password, DB_SSL: 'false', TEST_DATABASE_ISOLATED: '1' },
  });
  process.exitCode = await new Promise(resolve => child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1)));
} catch (error) {
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Falló la integración.');
  process.exitCode = 1;
} finally {
  if (started) {
    try { docker(['rm', '--force', name]); } catch { console.error('No se pudo retirar el contenedor de prueba.'); }
  }
  await rm(directory, { recursive: true, force: true });
}
