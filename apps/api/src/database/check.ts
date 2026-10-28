import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions, readConfig } from '../config/env.js';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema.js';

let connection;
try {
  connection = await mysql.createConnection(databaseOptions(readConfig()));
  const [rows] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version, @@lower_case_table_names AS letterCase');
  console.log(`Conexión MySQL/MariaDB verificada. Versión: ${rows[0]?.version}. lower_case_table_names: ${rows[0]?.letterCase}.`);
  const [tables] = await connection.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
  const actual = new Set(tables.map(table => String(table.name).toUpperCase()));
  const expected = Object.values(schema).map(table => getTableName(table));
  const missing = expected.filter(table => !actual.has(table));
  console.log(`Tablas previstas presentes: ${expected.length - missing.length}/${expected.length}.`);
  if (missing.length) {
    console.error(`Faltan tablas: ${missing.join(', ')}. Aplicar las migraciones pendientes.`);
    process.exitCode = 1;
  }
  if (!missing.length) {
    if (actual.has('NUMERACIONUSO')) {
      console.error('Falta aplicar la migración que elimina el historial de numeradores. Ejecutar db:migrate:prod con la aplicación detenida.');
      process.exitCode = 1;
    }
    const [columns] = await connection.query<RowDataPacket[]>("SELECT TABLE_NAME AS tabla, COLUMN_NAME AS campo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('CUENTACORRIENTE','CAJAMOVIMIENTO','NUMERACION','COMPROBANTE')");
    const has = (table: string, field: string) => columns.some(row => row.tabla === table && row.campo === field);
    if (!has('CUENTACORRIENTE','NumeroComprobante') || !has('CAJAMOVIMIENTO','NumeroComprobante') || has('NUMERACION','Serie') || !has('NUMERACION','Codigo') || has('NUMERACION','Comprobante') || !has('COMPROBANTE','Numerador')) {
      console.error('Falta completar la migración de numeradores compartidos. Ejecutar primero db:numbering:check:prod y aplicar las migraciones con la aplicación detenida.');
      process.exitCode = 1;
    }
  }
  if (!actual.has('__DRIZZLE_MIGRATIONS')) {
    console.error('No se encontró el historial de migraciones. Revisar la preparación de esta base antes de continuar.');
    process.exitCode = 1;
  }
  if (Number(rows[0]?.letterCase) !== 0) console.log('Este servidor normaliza nombres de tablas; verificar esta diferencia antes de trasladar la base.');
} catch {
  console.error('No se pudo verificar MySQL. Revisar DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD y TLS.');
  process.exitCode = 1;
} finally {
  await connection?.end();
}
