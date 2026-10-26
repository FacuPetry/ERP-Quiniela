import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { voucherBase } from "@erp/shared";
export function voucherLockName(database: string, namespace: string) {
  return (
    "erp_cc_" +
    createHash("sha256")
      .update(JSON.stringify([database, namespace]))
      .digest("hex")
      .slice(0, 48)
  );
}
export async function lastVoucher(
  connection: Pool | PoolConnection,
  comprobante: string,
  value: string,
) {
  const start = (BigInt(value) / voucherBase) * voucherBase;
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT MAX(NumeroComprobante) AS ultimo FROM (
    SELECT NumeroComprobante FROM CUENTACORRIENTE WHERE Comprobante = ? AND NumeroComprobante BETWEEN ? AND ?
    UNION ALL SELECT NumeroComprobante FROM CAJAMOVIMIENTO WHERE Comprobante = ? AND NumeroComprobante BETWEEN ? AND ?
  ) r`,
    [
      comprobante,
      (start + 1n).toString(),
      (start + voucherBase - 1n).toString(),
      comprobante,
      (start + 1n).toString(),
      (start + voucherBase - 1n).toString(),
    ],
  );
  return rows[0]!.ultimo == null ? null : BigInt(rows[0]!.ultimo);
}
