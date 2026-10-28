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
const maria = process.argv.includes('--mariadb');
const image = maria ? 'mariadb:11.8.9@sha256:f16d7a344413e519dff518f27bdb221388f84b0d274c97c4fb5f2cb0dc1b34fa'
  : (await readFile(join(root, 'compose.yaml'), 'utf8')).match(/image: (mysql:[^\s]+)/)?.[1];
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
  const prefix = maria ? 'MARIADB' : 'MYSQL';
  await writeFile(environmentFile, [
    `${prefix}_DATABASE=erp_quiniela_test`, `${prefix}_USER=erp`,
    `${prefix}_PASSWORD=${password}`, `${prefix}_ROOT_PASSWORD=${randomBytes(24).toString('hex')}`, '',
  ].join('\n'), { mode: 0o600 });
  console.log(`Iniciando ${maria ? 'MariaDB 11.8.9' : 'MySQL 8.4'} aislado para integración; no se utilizará la base de desarrollo o producción.`);
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
  // Node ordena alfabéticamente los archivos incluso con concurrencia 1.
  // La preparación inicial debe verificarse antes de insertar fixtures de negocio.
  for (const testFile of ['tests/integration/numbering-migration.test.ts', 'tests/integration/database.test.ts', 'tests/integration/masters.test.ts', 'tests/integration/current-account.test.ts', 'tests/integration/cash-movement.test.ts', 'tests/integration/list-order.test.ts', 'tests/integration/cash-corrections.test.ts', 'tests/integration/treasury.test.ts', 'tests/integration/shared-numbering.test.ts']) {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', testFile], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: 'erp_quiniela_test', DB_USER: 'erp', DB_PASSWORD: password, DB_SSL: 'false', TEST_DATABASE_ISOLATED: '1' },
    });
    const code = await new Promise(resolve => child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1)));
    if (code !== 0) { process.exitCode = code; break; }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Falló la integración.');
  process.exitCode = 1;
} finally {
  if (started) {
    try { docker(['rm', '--force', '--volumes', name]); } catch { console.error('No se pudo retirar el contenedor de prueba.'); }
  }
  await rm(directory, { recursive: true, force: true });
}
