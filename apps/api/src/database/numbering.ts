import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  nextVoucher,
  voucherBase,
  voucherNumberError,
  type CashModule,
  type NumberingOption,
} from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
type Conn = Pool | PoolConnection;
type Module = CashModule | "CUENTACORRIENTE" | "VALORES";
function fail(message: string): never {
  throw new MasterRequestError(409, message);
}
export async function numberingOptions(
  c: Conn,
  module: Module,
): Promise<NumberingOption[]> {
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT c.Codigo AS Comprobante,n.Codigo,n.Caja,n.Activo,n.ProximoNumero FROM COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Numerador WHERE c.ModuloOrigen=?",
    [module],
  );
  return rows.map((r) => ({
    Comprobante: String(r.Comprobante),
    Codigo: String(r.Codigo),
    Caja: r.Caja == null ? null : String(r.Caja),
    Activo: Boolean(r.Activo),
    ProximoNumero: String(r.ProximoNumero),
  }));
}
async function configured(c: Conn, code: string, lock = false) {
  const [vouchers] = await c.execute<RowDataPacket[]>(
    "SELECT Codigo,Numerador FROM COMPROBANTE WHERE Codigo=?" +
      (lock ? " FOR UPDATE" : ""),
    [code],
  );
  if (!vouchers[0])
    throw new MasterRequestError(400, "El comprobante no existe.");
  const assigned = vouchers[0].Numerador;
  if (!assigned) return null;
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT * FROM NUMERACION WHERE Codigo=?" + (lock ? " FOR UPDATE" : ""),
    [String(assigned)],
  );
  return rows[0] ?? null;
}
async function suitable(
  c: Conn,
  n: RowDataPacket | null,
  module: Module,
  opening?: string,
) {
  if (!n?.Activo) return false;
  if (module === "CUENTACORRIENTE" || n.Caja == null) return true;
  if (!opening) return false;
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT Caja FROM CAJASALDO WHERE IDTabla=?",
    [opening],
  );
  return rows[0]?.Caja === n.Caja;
}
export async function previewNumber(
  c: Conn,
  code: string,
  module: Module,
  opening?: string,
) {
  const n = await configured(c, code);
  if (!(await suitable(c, n, module, opening)))
    fail(
      "No hay un numerador activo configurado para esta caja y comprobante. La reversión requiere uno válido.",
    );
  return String(n!.ProximoNumero);
}
/** Se ejecuta dentro de la transacción financiera. C→Numerador es el orden de bloqueo. */
export async function issueNumber(
  c: PoolConnection,
  code: string,
  requested: string,
  module: Module,
  opening?: string,
  requireAutomatic = false,
  expectedAutomatic?: boolean,
) {
  const n = await configured(c, code, true);
  const available = await suitable(c, n, module, opening);
  if (requireAutomatic && !available)
    fail(
      "No hay un numerador activo configurado para esta caja y comprobante. La reversión requiere uno válido.",
    );
  if (expectedAutomatic === true && !available)
    fail(
      "La configuración del numerador cambió. Actualizá las opciones y revisá el número antes de guardar.",
    );
  const automatic =
    available && (requireAutomatic || expectedAutomatic !== false);
  const number = automatic ? String(n!.ProximoNumero) : requested;
  const invalid = voucherNumberError(number);
  if (invalid) throw new MasterRequestError(400, invalid);
  for (const table of ["CUENTACORRIENTE", "CAJAMOVIMIENTO"]) {
    const [duplicates] = await c.execute<RowDataPacket[]>(
      `SELECT Comprobante FROM ${table} WHERE Comprobante=? AND NumeroComprobante=? LIMIT 1`,
      [code, number],
    );
    if (duplicates.length)
      fail(
        "Ese comprobante y número ya están registrados, incluidos anulados y revertidos.",
      );
  }
  // Una edición manual solo adelanta el mismo punto; nunca retrocede la sugerencia.
  const advances =
    available &&
    (automatic ||
      (BigInt(number) / voucherBase ===
        BigInt(n!.ProximoNumero) / voucherBase &&
        BigInt(number) >= BigInt(n!.ProximoNumero)));
  if (advances) {
    const next = nextVoucher(number);
    await c.execute(
      "UPDATE NUMERACION SET ProximoNumero=?,Activo=? WHERE IDTabla=?",
      [next ?? number, next === null ? 0 : 1, String(n!.IDTabla)],
    );
  }
  return number;
}
