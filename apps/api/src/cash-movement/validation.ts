import { listOrderFields } from "../database/list-order-validation.js";
import { z } from "zod";
import { voucherNumberError } from "@erp/shared";
export const code = z.string().trim().min(1).max(20);
export const id = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(
    (v) => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
  );
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "1000-01-01"
    );
  }, "Ingresá una fecha válida.");
export const amount = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    "Ingresá un importe con hasta dos decimales.",
  )
  .transform((v) => {
    const [a, b = ""] = v.split(".");
    return BigInt(a!).toString() + "." + b.padEnd(2, "0");
  });
const positive = amount.refine(
  (v) => /[1-9]/.test(v),
  "El importe debe ser mayor que cero.",
);
const number = z
  .string()
  .superRefine((v, c) => {
    const e = v === "0" ? undefined : voucherNumberError(v);
    if (e) c.addIssue({ code: "custom", message: e });
  })
  .transform((v) => BigInt(v).toString());
const text = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .transform((v) => v || null);
const cheque = z
  .object({
    Tipo: z.enum(["PROPIO", "TERCERO"]),
    Banco: code,
    BancoCuenta: code.nullable(),
    CuentaLibradora: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 .\/-]{1,50}$/)
      .transform((v) => v.replace(/[ .\/-]/g, "").toUpperCase())
      .nullable(),
    Numero: z
      .string()
      .trim()
      .regex(/^\d{1,30}$/),
    Librador: z.string().trim().max(150).nullable(),
    Documento: z.string().trim().max(20).nullable(),
    Emision: date,
    Vencimiento: date,
    Importe: positive,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.Vencimiento < v.Emision)
      c.addIssue({
        code: "custom",
        path: ["Vencimiento"],
        message: "El vencimiento no puede ser anterior a la emisión.",
      });
    if (v.Tipo === "PROPIO" && !v.BancoCuenta)
      c.addIssue({
        code: "custom",
        path: ["BancoCuenta"],
        message: "Seleccioná la cuenta propia.",
      });
    if (v.Tipo === "TERCERO" && (!v.CuentaLibradora || v.BancoCuenta))
      c.addIssue({
        code: "custom",
        path: ["CuentaLibradora"],
        message:
          "Ingresá la cuenta libradora del tercero, sin asignar una cuenta propia.",
      });
  });
export const creation = z
  .object({
    NumeroAutomatico: z.boolean().optional(),
    Comprobante: code,
    NumeroComprobante: number,
    Cliente: code,
    FechaOrigen: date,
    CajaSaldo: id,
    Concepto: code.nullable(),
    ImporteEfectivo: amount,
    ImporteACuenta: amount,
    Observacion: text,
    Afectaciones: z
      .array(z.object({ CuentaCorriente: id, Importe: positive }).strict())
      .max(100),
    Valores: z
      .array(
        z.union([
          cheque,
          z
            .object({
              Tipo: z.literal("TRANSFERENCIA"),
              BancoCuenta: code,
              Importe: positive,
              Referencia: z.string().trim().max(100).nullable(),
            })
            .strict(),
          z.object({ Tipo: z.literal("CARTERA"), Cheque: id }).strict(),
        ]),
      )
      .max(50),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.NumeroAutomatico) {
      const e = voucherNumberError(v.NumeroComprobante);
      if (e)
        c.addIssue({ code: "custom", path: ["NumeroComprobante"], message: e });
    }
  })
  .refine(
    (v) =>
      new Set(v.Afectaciones.map((a) => a.CuentaCorriente)).size ===
      v.Afectaciones.length,
    "No repitas documentos en las afectaciones.",
  )
  .refine(
    (v) =>
      new Set(
        v.Valores.filter((v) => v.Tipo === "CARTERA").map((v) => v.Cheque),
      ).size === v.Valores.filter((v) => v.Tipo === "CARTERA").length,
    "No repitas cheques de cartera.",
  );
export const query = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    Estado: z
      .enum(["TODOS", "CONFIRMADO", "ANULADO", "REVERTIDO"])
      .default("TODOS"),
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
export const pendingQuery = z
  .object({
    ...listOrderFields,
    Cliente: code,
    Comprobante: code,
    Excluir: z
      .string()
      .max(2000)
      .default("")
      .transform((v) => (v ? v.split(",") : []))
      .pipe(z.array(id).max(100)),
    q: z.string().trim().max(100).default(""),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const opening = z.object({ Caja: code, SaldoInicial: amount }).strict();
export const closing = z
  .object({ SaldoContado: amount, Observacion: text })
  .strict();
export const reversal = z
  .object({
    CajaSaldo: id,
    Motivo: z.string().trim().min(1).max(500),
  })
  .strict();

export const annulment = z
  .object({
    CajaSaldo: id,
    Motivo: z.string().trim().min(1, "Ingresá el motivo.").max(500),
    ConfirmarCorreccionBancaria: z.boolean().default(false),
  })
  .strict();

/** No admite clientes, valores ni afectaciones en una operación interna. */
export const treasuryCreation = z
  .object({
    NumeroAutomatico: z.boolean().optional(),
    Comprobante: code,
    NumeroComprobante: number,
    CajaSaldo: id,
    Concepto: code,
    FechaOrigen: date,
    Importe: positive,
    Observacion: text,
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.NumeroAutomatico) {
      const e = voucherNumberError(v.NumeroComprobante);
      if (e)
        c.addIssue({ code: "custom", path: ["NumeroComprobante"], message: e });
    }
  });
