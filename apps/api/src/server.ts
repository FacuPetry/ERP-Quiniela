import { resolve } from 'node:path';
import { createApp } from './app.js';
import { projectRoot, readConfig } from './config/env.js';
import { createDatabase } from './database/client.js';
import { createAuthStore } from './auth/store.js';
import { createAuthService } from './auth/service.js';
import { createMasterStore } from './masters/store.js';

const config = readConfig();
const { pool } = createDatabase(config);
const app = createApp({
  auth: createAuthService(createAuthStore(pool)),
  masters: createMasterStore(pool),
  secureCookie: config.NODE_ENV === 'production',
  checkDatabase: async () => { await pool.query('SELECT 1'); },
  ...(config.NODE_ENV === 'production' ? { webDist: resolve(projectRoot, 'apps/web/dist') } : {}),
});
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`ERP Quiniela: servidor iniciado en puerto ${config.PORT} (${config.NODE_ENV}).`);
});
server.on('error', async () => {
  console.error('No se pudo iniciar el servidor. Revisar HOST y PORT.');
  await pool.end();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { void pool.end(); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
