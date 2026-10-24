import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { databaseOptions, type AppConfig } from '../config/env.js';
import * as schema from './schema.js';

export function createDatabase(config: AppConfig) {
  const pool = mysql.createPool({ ...databaseOptions(config), connectionLimit: 5, waitForConnections: true, queueLimit: 20 });
  const db = drizzle(pool, { schema, mode: 'default' });
  return { pool, db };
}
