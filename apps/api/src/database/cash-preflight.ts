import type { Connection, RowDataPacket } from "mysql2/promise";
/** Solo lectura: detiene la migración antes del DDL si hay datos incompatibles. */
export async function inspectCashMigration(c: Connection) {
  const [columns] = await c.query<RowDataPacket[]>(
    "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('CAJAMOVIMIENTO','CHEQUE','CAJAMOVIMIENTOAFECTACION')",
  );
  if (!columns.some((r) => r.TABLE_NAME === "CAJAMOVIMIENTO")) return [];
  const added = [
    ["CAJAMOVIMIENTO", "CajaMovimientoOrigen"],
    ["CAJAMOVIMIENTO", "ImporteACuenta"],
    ["CHEQUE", "CuentaLibradora"],
    ["CAJAMOVIMIENTOAFECTACION", "CreadoEn"],
    ["CAJAMOVIMIENTOAFECTACION", "Usuario"],
  ].map(([table, field]) =>
    columns.some((r) => r.TABLE_NAME === table && r.COLUMN_NAME === field),
  );
  if (added.every(Boolean)) return [];
  if (added.some(Boolean))
    return [
      "Migración de Caja movimiento incompleta. Revisar el DDL y el historial antes de repetirla; no se modificaron registros.",
    ];
  const issues: string[] = [];
  const [invalid] = await c.query<RowDataPacket[]>(
    "SELECT m.IDTabla FROM CAJAMOVIMIENTO m LEFT JOIN (SELECT CajaMovimiento,SUM(Importe) AS Aplicado FROM CAJAMOVIMIENTOAFECTACION GROUP BY CajaMovimiento) x ON x.CajaMovimiento=m.IDTabla WHERE m.ImporteTotal<0 OR m.ImporteTotal<COALESCE(x.Aplicado,0) LIMIT 1",
  );
  if (invalid.length)
    issues.push(
      "Hay movimientos con total negativo o afectaciones superiores al total. Revisarlos antes de migrar Caja movimiento.",
    );
  const [duplicate] = await c.query<RowDataPacket[]>(
    "SELECT Tipo,BancoCuenta,Numero FROM CHEQUE WHERE BancoCuenta IS NOT NULL GROUP BY Tipo,BancoCuenta,Numero HAVING COUNT(*)>1 LIMIT 1",
  );
  if (duplicate.length)
    issues.push(
      "Hay cheques duplicados por tipo, cuenta propia y número. Revisarlos antes de incorporar su clave única.",
    );
  return issues;
}
