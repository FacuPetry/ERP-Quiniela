import { z } from "zod";
import { valueStates, voucherNumberError } from "@erp/shared";
import { code, date, id } from "../cash-movement/validation.js";
import { listOrderFields } from "../database/list-order-validation.js";

export const valueIdentity = z
  .object({
    family: z.enum(["CHEQUE", "TRANSFERENCIA"]),
    id,
  })
  .strict();
export const valueQuery = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    Tipo: z
      .enum(["TODOS", "PROPIO", "TERCERO", "TRANSFERENCIA"])
      .default("TODOS"),
    Estado: z
      .string()
      .refine((v) => v === "TODOS" || valueStates.some((s) => s.value === v))
      .default("TODOS"),
    Banco: z.string().trim().min(1).max(20).optional(),
    BancoCuenta: z.string().trim().min(1).max(20).optional(),
    FechaPor: z.enum(["EMISION", "VENCIMIENTO"]).default("EMISION"),
    Desde: date.optional(),
    Hasta: date.optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (v) => !v.Desde || !v.Hasta || v.Desde <= v.Hasta,
    "Revisá el rango de fechas.",
  );
export type ValueQuery = z.infer<typeof valueQuery>;

export const chequeAccreditation = z
  .object({
    Cheques: z
      .array(id)
      .min(1)
      .max(100)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "No repitas cheques en la operación.",
      )
      .transform((ids) =>
        [...ids].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)),
      ),
    Fecha: date,
    Observacion: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .transform((v) => v || null),
  })
  .strict();
// Conservar el orden canónico anterior para que los reintentos de depósitos
// ya registrados mantengan su huella después de actualizar la aplicación.
export const chequeDeposit = z
  .object({
    Cheques: chequeAccreditation.shape.Cheques,
    BancoCuenta: code,
    Fecha: chequeAccreditation.shape.Fecha,
    Observacion: chequeAccreditation.shape.Observacion,
  })
  .strict();
export const chequeRejection = z
  .object({
    Comprobante: code,
    NumeroComprobante: z
      .string()
      .regex(/^\d{1,12}$/)
      .transform((v) => BigInt(v).toString()),
    NumeroAutomatico: z.boolean().optional(),
    Fecha: date,
    Motivo: z.string().trim().min(1, "Ingresá el motivo.").max(500),
    ConfirmarDebitoBancario: z.boolean(),
    FechaDebito: date.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.NumeroAutomatico) {
      const error = voucherNumberError(v.NumeroComprobante);
      if (error)
        ctx.addIssue({
          code: "custom",
          path: ["NumeroComprobante"],
          message: error,
        });
    }
  });
