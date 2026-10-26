import type { Connection, RowDataPacket } from "mysql2/promise";
/** Se ejecuta antes de cualquier DDL de la migración nueva. Nunca corrige ni elimina datos. */
export async function inspectNumberingMigration(
  connection: Connection,
): Promise<string[]> {
  const [columns] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS tabla, COLUMN_NAME AS campo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('NUMERACION','CUENTACORRIENTE','CAJAMOVIMIENTO')",
  );
  const has = (table: string, field: string) =>
    columns.some((row) => row.tabla === table && row.campo === field);
  if (!columns.length) return [];
  if (
    !has("NUMERACION", "Serie") &&
    has("CUENTACORRIENTE", "NumeroComprobante") &&
    has("CAJAMOVIMIENTO", "NumeroComprobante")
  )
    return [];
  if (
    has("CUENTACORRIENTE", "NumeroComprobante") ||
    has("CAJAMOVIMIENTO", "NumeroComprobante")
  )
    return [
      "Migración de numeración incompleta. Revisar su estado o restaurar el respaldo antes de repetirla.",
    ];
  const issues: string[] = [];
  const count = async (sql: string, message: string) => {
    const [rows] = await connection.query<RowDataPacket[]>(sql);
    if (Number(rows[0]!.total))
      issues.push(message + " Cantidad: " + rows[0]!.total + ".");
  };
  await count(
    "SELECT COUNT(*) AS total FROM (SELECT Comprobante FROM NUMERACION GROUP BY Comprobante HAVING COUNT(*) > 1) r",
    "Hay comprobantes con más de un numerador. Elegir cuál conservar antes de migrar; no se elimina ninguno automáticamente.",
  );
  await count(
    "SELECT COUNT(*) AS total FROM NUMERACION WHERE (CHAR_LENGTH(Serie) NOT BETWEEN 1 AND 4 OR Serie REGEXP '[^0-9]') OR ProximoNumero NOT BETWEEN 1 AND 99999999",
    "Hay numeradores con series o correlativos incompatibles con cuatro y ocho dígitos.",
  );
  for (const table of ["CUENTACORRIENTE", "CAJAMOVIMIENTO"]) {
    await count(
      `SELECT COUNT(*) AS total FROM ${table} WHERE Numero IS NOT NULL AND Numero NOT BETWEEN 1 AND 99999999`,
      `${table}: hay números anteriores fuera del rango de ocho dígitos.`,
    );
    await count(
      `SELECT COUNT(*) AS total FROM ${table} c LEFT JOIN NUMERACION n ON n.IDTabla = c.Numeracion WHERE c.Numeracion IS NOT NULL AND (n.IDTabla IS NULL OR n.Comprobante <> c.Comprobante)`,
      `${table}: hay referencias de numeración inexistentes o de otro comprobante.`,
    );
    if (!issues.length)
      await count(
        `SELECT COUNT(*) AS total FROM (SELECT Comprobante, numero FROM (SELECT c.Comprobante, CAST(COALESCE(n.Serie,'0') AS UNSIGNED) * 100000000 + c.Numero AS numero FROM ${table} c LEFT JOIN NUMERACION n ON n.IDTabla = c.Numeracion WHERE c.Numero IS NOT NULL) converted GROUP BY Comprobante, numero HAVING COUNT(*) > 1) r`,
        `${table}: la conversión produciría números duplicados.`,
      );
  }
  return issues;
}
export class NumberingMigrationError extends Error {}
