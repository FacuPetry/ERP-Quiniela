import { z } from "zod";
import { listOrderFields } from "../database/list-order-validation.js";
const resultFields = {
  // El modo continuo devuelve el resultado completo en un único snapshot.
  continuo: z.literal("1").optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      value >= "1000-01-01" &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Ingresá una fecha válida.");
export const summaryQuery = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    Cliente: z.string().trim().max(20).optional(),
    ClienteTipo: z.string().trim().min(1).max(20).optional(),
    ...resultFields,
  })
  .strict();
export type SummaryQuery = z.infer<typeof summaryQuery>;

export const ledgerQuery = z
  .object({
    Cliente: z.string().trim().min(1, "Seleccioná un cliente.").max(20),
    Desde: date.optional(),
    Hasta: date.optional(),
    ...resultFields,
  })
  .strict()
  .refine(
    (v) => !v.Desde || !v.Hasta || v.Desde <= v.Hasta,
    "Revisá el rango de fechas.",
  );
export type LedgerQuery = z.infer<typeof ledgerQuery>;

export const cashReportQuery = z
  .object({
    ...listOrderFields,
    ...resultFields,
    Caja: z.string().trim().min(1).max(20).optional(),
    Estado: z.enum(["TODOS", "ABIERTO", "CERRADO"]).default("TODOS"),
    Desde: date.optional(),
    Hasta: date.optional(),
  })
  .strict()
  .refine(
    (v) => !v.Desde || !v.Hasta || v.Desde <= v.Hasta,
    "Revisá el rango de fechas.",
  );
export type CashReportQuery = z.infer<typeof cashReportQuery>;
