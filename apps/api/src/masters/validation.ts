import { listOrderFields } from "../database/list-order-validation.js";
import { z } from "zod";
import {
  integerFieldError,
  voucherNumberError,
  masterDefinitions,
  ModuloComprobante,
  type MasterDefinition,
} from "@erp/shared";

export class MasterRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly campos?: Record<string, string>,
  ) {
    super(message);
  }
}

export function definition(key: string): MasterDefinition {
  if (!Object.hasOwn(masterDefinitions, key))
    throw new MasterRequestError(404, "Maestro no encontrado.");
  return masterDefinitions[key as keyof typeof masterDefinitions];
}

export function recordSchema(master: MasterDefinition, creation = false) {
  const fields: Record<string, z.ZodType> = { Activo: z.boolean() };
  for (const field of master.fields) {
    if (field.kind === "boolean") {
      fields[field.name] = z.boolean().default(false);
      continue;
    }
    if (
      field.name === "IDTabla" &&
      master.primaryKey === "IDTabla" &&
      creation
    ) {
      fields.IDTabla = z
        .string()
        .max(0, "El identificador se asigna al guardar.")
        .optional()
        .transform(() => "");
      continue;
    }
    if (field.name === "Codigo" && master.automaticCode && creation) {
      fields.Codigo = z
        .string()
        .max(0, "El código se asigna automáticamente al guardar.")
        .optional()
        .transform(() => "");
      continue;
    }
    let value = z
      .string()
      .trim()
      .max(field.maxLength, `Hasta ${field.maxLength} caracteres.`);
    if (field.required) value = value.min(1, "Completá este campo.");
    if (field.name === "Codigo")
      value = value.regex(
        /^[^\p{Cc}]+$/u,
        "El código no puede contener caracteres de control.",
      );
    const checked =
      field.kind === "email"
        ? value.refine(
            (text) => !text || z.email().safeParse(text).success,
            "Ingresá un correo válido.",
          )
        : field.kind === "select"
          ? value.refine(
              (text) => field.options?.some((option) => option.value === text),
              "Seleccioná una opción válida.",
            )
          : field.kind === "voucher"
            ? value
                .superRefine((text, context) => {
                  const error = voucherNumberError(text);
                  if (error)
                    context.addIssue({ code: "custom", message: error });
                })
                .transform((text) => BigInt(text).toString())
            : field.kind === "integer"
              ? value
                  .superRefine((text, context) => {
                    const error = integerFieldError(field, text);
                    if (error)
                      context.addIssue({ code: "custom", message: error });
                  })
                  .transform((text) => (text ? BigInt(text).toString() : text))
              : value;
    fields[field.name] = field.required
      ? checked
      : checked
          .nullable()
          .optional()
          .transform((text) => text || null);
  }
  return z.object(fields).strict();
}

export const listQuery = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    estado: z.enum(["todos", "activo", "inactivo"]).default("todos"),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    referencia: z.string().trim().max(20).optional(),
    modulo: z.enum(ModuloComprobante).optional(),
  })
  .strict();
export type ListQuery = z.infer<typeof listQuery>;
