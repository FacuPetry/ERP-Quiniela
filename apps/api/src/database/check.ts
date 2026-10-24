import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions, readConfig } from '../config/env.js';

let connection;
try {
  connection = await mysql.createConnection(databaseOptions(readConfig()));
  const [rows] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version, @@lower_case_table_names AS letterCase');
  console.log(`Conexión MySQL verificada. Versión: ${rows[0]?.version}. lower_case_table_names: ${rows[0]?.letterCase}.`);
  const [tables] = await connection.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations' ORDER BY TABLE_NAME");
  console.log(`Tablas de la aplicación: ${tables.length}.`);
  if (Number(rows[0]?.letterCase) !== 0) console.log('Este servidor normaliza nombres de tablas; verificar esta diferencia antes de trasladar la base.');
} catch {
  console.error('No se pudo verificar MySQL. Revisar DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD y TLS.');
  process.exitCode = 1;
} finally {
  await connection?.end();
}
