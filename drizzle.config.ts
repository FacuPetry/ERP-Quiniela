import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './apps/api/src/database/schema.ts',
  out: './database/migrations',
  strict: true,
});
