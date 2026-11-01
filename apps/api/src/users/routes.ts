import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler, type Request } from "express";
import { z } from "zod";
import { menuOptions, type SessionResponse } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import {
  requireAdministrator,
  requireMasterWrite,
  requireSession,
} from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import { listOrderFields } from "../database/list-order-validation.js";
import type { UserStore } from "./store.js";
const permission = z
  .object({
    menu: z.enum(menuOptions.map((m) => m.key)),
    escritura: z.boolean(),
  })
  .strict()
  .refine(
    (p) =>
      !["informes-cuenta-corriente", "sistema"].includes(p.menu) ||
      !p.escritura,
    "El informe permite únicamente consulta.",
  );
const input = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().pipe(z.email().max(150)),
    activo: z.boolean(),
    permisos: z
      .array(permission)
      .max(menuOptions.length)
      .refine(
        (ps) => new Set(ps.map((p) => p.menu)).size === ps.length,
        "No repitas opciones del menú.",
      ),
  })
  .strict();
const password = z.string().min(12, "Utilizá al menos 12 caracteres.").max(128);
const identity = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((s) => BigInt(s) <= 9223372036854775807n);
const query = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    estado: z.enum(["todos", "activo", "inactivo"]).default("todos"),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const p = schema.safeParse(data);
  if (!p.success)
    throw new MasterRequestError(
      400,
      "Revisá los campos indicados.",
      Object.fromEntries(
        p.error.issues.map((i) => [
          String(i.path[0] ?? "formulario"),
          i.message,
        ]),
      ),
    );
  return p.data;
}
function version(req: Request) {
  const v = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
  if (!v)
    throw new MasterRequestError(
      400,
      "Volvé a abrir el usuario antes de guardar.",
    );
  return v;
}
export function usersRouter(auth: AuthService, store: UserStore) {
  const r = Router();
  r.use(requireSession(auth), requireAdministrator);
  r.get("/", async (req, res) =>
    res.json(await store.list(parse(query, req.query))),
  );
  r.get("/:id", async (req, res) =>
    res.json(await store.get(parse(identity, req.params.id))),
  );
  r.post("/", ...requireMasterWrite, async (req, res) =>
    res
      .status(201)
      .json(
        await store.create(
          parse(input.extend({ password }), req.body),
          (res.locals.session as SessionResponse).usuario.id,
        ),
      ),
  );
  r.put("/:id", ...requireMasterWrite, async (req, res) =>
    res.json(
      await store.update(
        parse(identity, req.params.id),
        parse(input, req.body),
        version(req),
        (res.locals.session as SessionResponse).usuario.id,
      ),
    ),
  );
  r.post("/:id/clave", ...requireMasterWrite, async (req, res) => {
    const body = parse(z.object({ password }).strict(), req.body);
    res.json(
      await store.resetPassword(
        parse(identity, req.params.id),
        body.password,
        version(req),
        (res.locals.session as SessionResponse).usuario.id,
      ),
    );
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof MasterRequestError) {
      res.status(error.status).json({
        error: error.message,
        ...(error.campos ? { campos: error.campos } : {}),
      });
      return;
    }
    const referencia = randomUUID();
    console.error(
      JSON.stringify({
        evento: "usuarios.error",
        referencia,
        codigo: typeof error?.code === "string" ? error.code : "ERROR_INTERNO",
      }),
    );
    res.status(500).json({
      error: "No se pudo completar la operación de usuarios.",
      referencia,
    });
  };
  r.use(errors);
  return r;
}
