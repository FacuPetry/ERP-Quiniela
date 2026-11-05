import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { BalanceMessagePreview } from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";

// La clave es el token HttpOnly de la sesión autenticada. No se expone ni se
// agrega una configuración global; sigue funcionando entre workers/reinicios.
const snapshot = z
  .object({
    Cliente: z.string().min(1).max(20),
    ClienteNombre: z.string().min(1).max(150),
    SaldoTotal: z.string().regex(/^-?\d{1,63}\.\d{2}$/),
    FechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    consultadoEn: z.string().datetime(),
    Telefono: z.string().max(40).nullable(),
    WhatsAppNumero: z
      .string()
      .regex(/^[1-9]\d{7,14}$/)
      .nullable(),
    Variables: z
      .object({
        NombreCliente: z.string().max(150),
        NombreFantasia: z.string().max(150),
        MontoTotal: z.string().max(120),
        FechaSaldo: z.string().max(10),
        ResumenSaldo: z.string().max(300),
      })
      .strict(),
  })
  .strict();
export type MessageSnapshot = z.infer<typeof snapshot>;
const signature = (payload: string, key: string) =>
  createHmac("sha256", key)
    .update("erp-message-notice-v1:" + payload)
    .digest();
export function signMessageSnapshot(row: BalanceMessagePreview, key: string) {
  const content: MessageSnapshot = {
    Cliente: row.Cliente,
    ClienteNombre: row.ClienteNombre,
    SaldoTotal: row.SaldoTotal,
    FechaHasta: row.FechaHasta,
    consultadoEn: row.consultadoEn,
    Telefono: row.Telefono,
    WhatsAppNumero: row.WhatsAppNumero,
    Variables: row.Variables,
  };
  const payload = Buffer.from(JSON.stringify(content)).toString("base64url");
  return payload + "." + signature(payload, key).toString("base64url");
}
export function readMessageSnapshot(
  token: string,
  key: string,
): MessageSnapshot {
  const parts = token.split(".");
  if (
    parts.length === 2 &&
    /^[A-Za-z0-9_-]+$/.test(parts[0]!) &&
    /^[A-Za-z0-9_-]{43}$/.test(parts[1]!)
  ) {
    const actual = Buffer.from(parts[1]!, "base64url"),
      expected = signature(parts[0]!, key);
    if (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    ) {
      try {
        const parsed = snapshot.safeParse(
          JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")),
        );
        if (parsed.success) return parsed.data;
      } catch {
        /* El recibo no se puede interpretar. */
      }
    }
  }
  throw new MasterRequestError(
    409,
    "La preparación del mensaje no es válida para esta sesión. Volvé a consultar antes de registrar el envío.",
  );
}
