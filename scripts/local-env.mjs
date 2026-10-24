import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../.env', import.meta.url));
const password = () => randomBytes(24).toString('hex');
try {
  await writeFile(path, [
    'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3000',
    'DB_HOST=127.0.0.1', 'DB_PORT=3307', 'DB_NAME=erp_quiniela',
    'DB_USER=erp', `DB_PASSWORD=${password()}`, `DB_ROOT_PASSWORD=${password()}`,
    'DB_SSL=false', 'WEB_PORT=5173', '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Archivo .env local creado con credenciales aleatorias. No se mostraron sus valores.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Se conserva el archivo .env existente.');
}
