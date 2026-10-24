import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
dotenv.config({ path: resolve(projectRoot, '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3307),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('erp_quiniela'),
  DB_USER: z.string().min(1).default('erp'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_SSL_CA_PATH: z.string().optional(),
});

export function readConfig(source: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Configuración inválida. Revisar: ${fields.join(', ')}.`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.DB_PASSWORD) {
    throw new Error('Configurar DB_PASSWORD para producción.');
  }
  return result.data;
}

export type AppConfig = ReturnType<typeof readConfig>;

export function databaseOptions(config: AppConfig) {
  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    connectTimeout: 5000,
    ...(config.DB_SSL === 'true' ? {
      ssl: {
        rejectUnauthorized: true,
        ...(config.DB_SSL_CA_PATH ? { ca: readFileSync(resolve(projectRoot, config.DB_SSL_CA_PATH)) } : {}),
      },
    } : {}),
  };
}
