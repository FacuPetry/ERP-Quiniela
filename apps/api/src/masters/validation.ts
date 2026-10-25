import { z } from "zod";
import { masterDefinitions, type MasterDefinition } from "@erp/shared";

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

export function recordSchema(master: MasterDefinition) {
  const fields: Record<string, z.ZodType> = { Activo: z.boolean() };
  for (const field of master.fields) {
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
    q: z.string().trim().max(100).default(""),
    estado: z.enum(["todos", "activo", "inactivo"]).default("todos"),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    referencia: z.string().trim().max(20).optional(),
  })
  .strict();
export type ListQuery = z.infer<typeof listQuery>;
