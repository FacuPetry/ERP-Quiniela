import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { databaseOptions, projectRoot, readConfig, type AppConfig } from '../config/env.js';
import type { RowDataPacket } from 'mysql2';
import { inspectNumberingMigration, NumberingMigrationError } from './numbering-preflight.js';
import { pathToFileURL } from 'node:url';

export async function applyMigrations(config: AppConfig) {
  const connection = await mysql.createConnection(databaseOptions(config));
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('erp_quiniela_migrations', 15) AS acquired");
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) throw new Error('Hay otra migración en ejecución.');
    const issues = await inspectNumberingMigration(connection);
    if (issues.length) throw new NumberingMigrationError(issues.join('\n'));
    await migrate(drizzle(connection), { migrationsFolder: resolve(projectRoot, 'database/migrations') });
  } finally {
    try {
      if (acquired) await connection.query("SELECT RELEASE_LOCK('erp_quiniela_migrations')");
    } finally { await connection.end(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await applyMigrations(readConfig());
    console.log('Migraciones aplicadas. Las ya registradas no se repitieron.');
  } catch (error) {
    if (error instanceof NumberingMigrationError) console.error(error.message);
    console.error('No se pudieron aplicar las migraciones. Revisar la conexión, permisos y estado de la base.');
    process.exitCode = 1;
  }
}
