import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= "1000-01-01"
    );
  }, "Ingresá una fecha válida.");
export const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    "Ingresá un importe positivo con hasta dos decimales.",
  )
  .refine((value) => /[1-9]/.test(value), "El importe debe ser mayor que cero.")
  .transform((value) => {
    const [whole, decimals = ""] = value.split(".");
    return BigInt(whole!).toString() + "." + decimals.padEnd(2, "0");
  });
export const creation = z
  .object({
    Cliente: z.string().trim().min(1).max(20),
    Comprobante: z.string().trim().min(1).max(20),
    Numeracion: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .refine(
        (v) =>
          /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
      )
      .nullable(),
    NumeroComprobante: z
      .string()
      .regex(/^\d{4}-\d{8}$/, "Usá el formato 0000-00000000.")
      .refine(
        (v) => !v.endsWith("-00000000"),
        "El número debe ser mayor que cero.",
      ),
    FechaOrigen: date,
    Vencimiento: date.nullable(),
    Importe: money,
    Observacion: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .transform((v) => v || null),
  })
  .strict()
  .refine((v) => !v.Vencimiento || v.Vencimiento >= v.FechaOrigen, {
    path: ["Vencimiento"],
    message: "El vencimiento no puede ser anterior a la fecha de origen.",
  });
export const cancellation = z
  .object({ Motivo: z.string().trim().min(1, "Ingresá el motivo.").max(500) })
  .strict();
export const querySchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    Cliente: z.string().trim().max(20).optional(),
    Comprobante: z.string().trim().max(20).optional(),
    Cuenta: z.enum(["COBRAR", "PAGAR"]).optional(),
    Estado: z.enum(["TODOS", "CONFIRMADO", "ANULADO"]).default("TODOS"),
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
export type AccountQuery = z.infer<typeof querySchema>;
