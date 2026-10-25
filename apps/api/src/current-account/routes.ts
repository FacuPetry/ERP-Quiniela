import {
  Router,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import type { z } from "zod";
import type { SessionResponse, CurrentAccountDetail } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireSession, requireMasterWrite } from "../auth/middleware.js";
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
  router.use(requireSession(auth));
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
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof MasterRequestError)) return next(error);
    res
      .status(error.status)
      .json({
        error: error.message,
        ...(error.campos ? { campos: error.campos } : {}),
      });
  };
  router.use(errors);
  return router;
}
