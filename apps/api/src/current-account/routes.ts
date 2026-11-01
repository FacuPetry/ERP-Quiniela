import {
  Router,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SessionResponse, CurrentAccountDetail } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import {
  requireSession,
  requireMasterWrite,
  requireMenu,
} from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import { creation, cancellation, querySchema } from "./validation.js";
import type { CurrentAccountStore } from "./store.js";
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new MasterRequestError(
      400,
      "Revisá los campos indicados.",
      Object.fromEntries(
        result.error.issues.map((issue) => [
          String(issue.path[0] ?? "formulario"),
          issue.message,
        ]),
      ),
    );
  return result.data;
}
function key(req: Request) {
  const value = req.get("Idempotency-Key") ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(value))
    throw new MasterRequestError(
      400,
      "Falta una clave válida para controlar los reintentos.",
    );
  return value;
}
function send(res: Response, result: CurrentAccountDetail, status = 200) {
  res
    .set("ETag", '"' + result.version + '"')
    .status(status)
    .json(result);
}
export function currentAccountRouter(
  auth: AuthService,
  store: CurrentAccountStore,
) {
  const router = Router();
  router.use(requireSession(auth), requireMenu("cuenta-corriente"));
  router.get("/opciones", async (_req, res) => {
    res.json(await store.options());
  });
  router.get("/", async (req, res) => {
    res.json(await store.list(parse(querySchema, req.query)));
  });
  router.get("/:id", async (req, res) => {
    send(res, await store.get(String(req.params.id)));
  });
  router.post("/", ...requireMasterWrite, async (req, res) => {
    const input = parse(creation, req.body);
    const user = (res.locals.session as SessionResponse).usuario;
    send(res, await store.create(input, user.id, key(req)), 201);
  });
  router.post("/:id/anular", ...requireMasterWrite, async (req, res) => {
    const input = parse(cancellation, req.body);
    const user = (res.locals.session as SessionResponse).usuario;
    const version = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
    if (!version)
      throw new MasterRequestError(
        400,
        "Volvé a abrir el movimiento antes de anularlo.",
      );
    send(
      res,
      await store.cancel(
        String(req.params.id),
        input.Motivo,
        version,
        user.id,
        key(req),
      ),
    );
  });
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    if (!(error instanceof MasterRequestError) || error.status >= 500) {
      const referencia = randomUUID();
      const fields =
        error && typeof error === "object"
          ? (error as Record<string, unknown>)
          : {};
      const code =
        typeof fields.code === "string" && /^[A-Z0-9_]{1,64}$/.test(fields.code)
          ? fields.code
          : "ERROR_INTERNO";
      // No imprimir el objeto de mysql2: incluye SQL con parámetros, ni el
      // mensaje/stack completos que pueden contener datos del movimiento.
      const origen =
        error instanceof Error
          ? error.stack?.match(
              /current-account\/(?:store|routes)\.(?:js|ts):\d+:\d+/,
            )?.[0]
          : undefined;
      console.error(
        JSON.stringify({
          evento: "cuenta_corriente.error",
          referencia,
          metodo: req.method,
          ruta: req.route?.path,
          codigo: code,
          errno: typeof fields.errno === "number" ? fields.errno : undefined,
          sqlState:
            typeof fields.sqlState === "string" &&
            /^[A-Z0-9]{5}$/.test(fields.sqlState)
              ? fields.sqlState
              : undefined,
          origen,
        }),
      );
      res
        .status(error instanceof MasterRequestError ? error.status : 500)
        .json({
          error:
            error instanceof MasterRequestError
              ? error.message
              : "No se pudo completar la solicitud.",
          referencia,
        });
      return;
    }
    res.status(error.status).json({
      error: error.message,
      ...(error.campos ? { campos: error.campos } : {}),
    });
  };
  router.use(errors);
  return router;
}
