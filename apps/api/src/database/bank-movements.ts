import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/** Alias bm reservado para BANCOMOVIMIENTO. Usar este predicado al calcular/reportar
 * el libro bancario: una anulación registral invalida sus asientos vinculados,
 * mientras que una reversión conserva original y contrapartida confirmados. */
export const effectiveBankMovement = `
  (bm.Transferencia IS NULL OR EXISTS (
    SELECT 1 FROM TRANSFERENCIA validity_t
    JOIN CAJAMOVIMIENTO validity_m ON validity_m.IDTabla=validity_t.CajaMovimiento
    WHERE validity_t.IDTabla=bm.Transferencia AND validity_m.Estado='CONFIRMADO'
  )) AND (bm.ChequeEvento IS NULL OR EXISTS (
    SELECT 1 FROM CHEQUEEVENTO validity_e
    LEFT JOIN CAJAMOVIMIENTO validity_cm ON validity_cm.IDTabla=validity_e.CajaMovimiento
    WHERE validity_e.IDTabla=bm.ChequeEvento
      AND (validity_e.CajaMovimiento IS NULL OR validity_cm.Estado='CONFIRMADO')
  ))`;

/** Conserva los asientos y registra su vigencia antes/después en la auditoría. */
export async function cashBankMovements(
  connection: Pool | PoolConnection,
  cashId: string,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT bm.IDTabla,bm.BancoCuenta,bm.Sentido,bm.Importe,(${effectiveBankMovement}) AS Vigente
     FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia
     WHERE t.CajaMovimiento=? ORDER BY bm.IDTabla`,
    [cashId],
  );
  return rows.map((row) => ({
    IDTabla: String(row.IDTabla),
    BancoCuenta: String(row.BancoCuenta),
    Sentido: String(row.Sentido),
    Importe: String(row.Importe),
    Vigente: Boolean(row.Vigente),
  }));
}
