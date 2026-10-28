import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  compatibleReversal,
  isReversalVoucher,
  type MasterRecord,
  isTreasuryVoucher,
} from "@erp/shared";
import { MasterRequestError } from "./validation.js";

/** Valida ambos extremos al editar: una asociación vigente nunca queda incompatible. */
export async function validateVoucherReversal(
  c: PoolConnection,
  input: MasterRecord,
) {
  const invalid = (field: string, message: string): never => {
    throw new MasterRequestError(400, "Revisá la configuración de reversión.", {
      [field]: message,
    });
  };
  const economic = (r: MasterRecord | RowDataPacket) => ({
    ModuloOrigen: r.ModuloOrigen,
    Cuenta: r.Cuenta,
    Naturaleza: r.Naturaleza,
    SentidoFondos: r.SentidoFondos,
    EsReversion: Boolean(r.EsReversion),
  });
  const sourceValid = (s: MasterRecord | RowDataPacket) =>
    !s.EsReversion &&
    ((s.ModuloOrigen === "COBROSPAGOS" && s.Naturaleza === "CREDITO") ||
      isTreasuryVoucher(economic(s)));
  if (input.EsReversion && !isReversalVoucher(economic(input)))
    invalid(
      "EsReversion",
      "Usá una reversión de Cobros y pagos (Deuda, Cobrar/Egreso o Pagar/Ingreso) o de Tesorería (Cuenta y Naturaleza No aplica, Ingreso/Egreso).",
    );
  if (input.ComprobanteReversion) {
    if (!sourceValid(input))
      invalid(
        "ComprobanteReversion",
        "Solo un comprobante normal válido de Cobros y pagos o Tesorería puede asociar una reversión.",
      );
    if (input.ComprobanteReversion === input.Codigo)
      invalid(
        "ComprobanteReversion",
        "Un comprobante no puede revertirse a sí mismo.",
      );
    const [rows] = await c.execute<RowDataPacket[]>(
      "SELECT * FROM COMPROBANTE WHERE Codigo=? LOCK IN SHARE MODE",
      [input.ComprobanteReversion],
    );
    const target = rows[0];
    if (
      !target ||
      target.ComprobanteReversion ||
      !compatibleReversal(economic(input), economic(target))
    )
      invalid(
        "ComprobanteReversion",
        "Seleccioná un comprobante exclusivo para reversiones, con la misma cuenta y sentido contrario, sin otra reversión asociada.",
      );
  }
  const [sources] = await c.execute<RowDataPacket[]>(
    "SELECT * FROM COMPROBANTE WHERE ComprobanteReversion=? LOCK IN SHARE MODE",
    [input.Codigo ?? null],
  );
  if (
    sources.some(
      (source) =>
        !sourceValid(source) ||
        input.ComprobanteReversion ||
        !compatibleReversal(economic(source), economic(input)),
    )
  )
    invalid(
      "EsReversion",
      "Otros comprobantes utilizan esta reversión. Conservá su compatibilidad o quitá primero esas asociaciones.",
    );
}
