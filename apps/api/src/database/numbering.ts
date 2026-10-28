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
export async function highestNumeratorNumber(
  c: Conn,
  codigo: string,
  value: string,
  includeVoucher: string | null = null,
) {
  const start = (BigInt(value) / voucherBase) * voucherBase;
  const [rows] = await c.execute<RowDataPacket[]>(
    `SELECT MAX(NumeroComprobante) AS ultimo FROM (
    SELECT a.NumeroComprobante FROM CUENTACORRIENTE a JOIN COMPROBANTE v ON v.Codigo=a.Comprobante WHERE v.Numerador=? OR v.Codigo=?
    UNION ALL SELECT m.NumeroComprobante FROM CAJAMOVIMIENTO m JOIN COMPROBANTE v ON v.Codigo=m.Comprobante WHERE v.Numerador=? OR v.Codigo=?
  ) x WHERE NumeroComprobante BETWEEN ? AND ?`,
    [
      codigo,
      includeVoucher,
      codigo,
      includeVoucher,
      (start + 1n).toString(),
      (start + voucherBase - 1n).toString(),
    ],
  );
  return rows[0]!.ultimo == null ? null : BigInt(rows[0]!.ultimo);
}
export async function assertNumeratorNext(
  c: Conn,
  codigo: string,
  next: string,
  includeVoucher: string | null = null,
) {
  const last = await highestNumeratorNumber(c, codigo, next, includeVoucher);
  if (last !== null && BigInt(next) <= last)
    throw new MasterRequestError(
      409,
      "Revisá el próximo número del numerador compartido.",
      {
        ProximoNumero:
          "Debe superar " +
          last +
          " en ese punto de venta, incluidos los anulados de los comprobantes asociados.",
      },
    );
}
export async function validateNumeratorLink(
  c: PoolConnection,
  comprobante: string,
  numerador: string,
) {
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT ProximoNumero,Activo FROM NUMERACION WHERE Codigo=? LOCK IN SHARE MODE",
    [numerador],
  );
  if (rows[0]?.Activo) {
    try {
      await assertNumeratorNext(
        c,
        numerador,
        String(rows[0].ProximoNumero),
        comprobante,
      );
    } catch (error) {
      if (error instanceof MasterRequestError)
        throw new MasterRequestError(
          error.status,
          "Ajustá el próximo número del numerador " +
            numerador +
            " antes de asociarlo.",
          { Numerador: error.campos?.ProximoNumero ?? error.message },
        );
      throw error;
    }
  }
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
  const automatic = await suitable(c, n, module, opening);
  if (requireAutomatic && !automatic)
    fail(
      "No hay un numerador activo configurado para esta caja y comprobante. La reversión requiere uno válido.",
    );
  if (expectedAutomatic !== undefined && expectedAutomatic !== automatic)
    fail(
      "La configuración del numerador cambió. Actualizá las opciones y revisá el número antes de guardar.",
    );
  let number = requested;
  if (automatic) {
    number = String(n!.ProximoNumero);
    const last = await highestNumeratorNumber(c, String(n!.Codigo), number);
    if (last !== null && last >= BigInt(number)) {
      const next = nextVoucher(last.toString());
      if (next === null)
        fail(
          "Se agotó el numerador. Configurá un nuevo punto de venta antes de continuar.",
        );
      number = next;
    }
  }
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
  if (automatic) {
    const next = nextVoucher(number);
    await c.execute(
      "UPDATE NUMERACION SET ProximoNumero=?,Activo=? WHERE IDTabla=?",
      [next ?? number, next === null ? 0 : 1, String(n!.IDTabla)],
    );
  }
  return number;
}
