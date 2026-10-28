import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { projectRoot } from "../config/env.js";
/** Lectura previa a cualquier DDL: no fusiona numeradores ni renumera movimientos. */
export async function inspectSharedNumberingMigration(
  c: Connection,
): Promise<string[]> {
  const [columns] = await c.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS tabla,COLUMN_NAME AS campo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('NUMERACION','COMPROBANTE','NUMERACIONUSO','CUENTACORRIENTE','CAJAMOVIMIENTO')",
  );
  const has = (t: string, f: string) =>
    columns.some((r) => r.tabla === t && r.campo === f);
  if (!has("NUMERACION", "IDTabla")) return [];
  const newer = [
    has("NUMERACION", "Codigo"),
    has("NUMERACION", "Caja"),
    has("COMPROBANTE", "Numerador"),
  ];
  if (newer.some(Boolean) || has("NUMERACIONUSO", "Numerador")) {
    if (!newer.every(Boolean) || has("NUMERACION", "Comprobante"))
      return [
        "Migración de numeradores compartidos incompleta. Revisar el DDL antes de repetirla.",
      ];
    const journal = JSON.parse(
      readFileSync(
        resolve(projectRoot, "database/migrations/meta/_journal.json"),
        "utf8",
      ),
    );
    const migration = journal.entries.find(
      (e: { tag: string }) => e.tag === "0006_numeradores_compartidos",
    );
    const [history] = await c.execute<RowDataPacket[]>(
      "SELECT hash FROM __drizzle_migrations WHERE created_at=?",
      [migration.when],
    );
    return history.length
      ? []
      : [
          "La estructura de numeradores compartidos no está registrada en el historial. Revisar la migración antes de continuar.",
        ];
  }
  const modern = has("CUENTACORRIENTE", "NumeroComprobante");
  if (modern !== has("CAJAMOVIMIENTO", "NumeroComprobante")) return [];
  const number = (a: string) =>
    modern
      ? `${a}.NumeroComprobante`
      : `COALESCE((SELECT CAST(s.Serie AS UNSIGNED) FROM NUMERACION s WHERE s.IDTabla=${a}.Numeracion),0)*100000000+${a}.Numero`;
  const a = number("a"),
    m = number("m");
  const effective = `SELECT a.Comprobante,(${a}) AS NumeroComprobante FROM CUENTACORRIENTE a WHERE (${a}) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM CAJAMOVIMIENTO m WHERE m.IDTabla=a.CajaMovimiento AND m.Comprobante=a.Comprobante AND (${m})=(${a})) UNION ALL SELECT m.Comprobante,(${m}) AS NumeroComprobante FROM CAJAMOVIMIENTO m WHERE (${m}) IS NOT NULL`;
  const [dups] = await c.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM (SELECT n.IDTabla,r.NumeroComprobante FROM (${effective}) r JOIN NUMERACION n ON n.Comprobante=r.Comprobante GROUP BY n.IDTabla,r.NumeroComprobante HAVING COUNT(*)>1) d`,
  );
  const issues: string[] = [];
  if (Number(dups[0]!.total))
    issues.push(
      "Hay emisiones duplicadas que no son el asiento interno de una misma operación. Cantidad: " +
        dups[0]!.total +
        ". Resolver antes de migrar; no se fusionan ni renumeran registros.",
    );
  return issues;
}
