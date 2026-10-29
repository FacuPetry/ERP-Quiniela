import { z } from "zod";
import { valueStates } from "@erp/shared";
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

export const chequeDeposit = z
  .object({
    Cheques: z
      .array(id)
      .min(1)
      .max(100)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "No repitas cheques en el depósito.",
      )
      .transform((ids) =>
        [...ids].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)),
      ),
    BancoCuenta: code,
    Fecha: date,
    Observacion: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .transform((v) => v || null),
  })
  .strict();
