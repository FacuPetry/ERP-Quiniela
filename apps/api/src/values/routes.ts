import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { z } from "zod";
import type { SessionResponse } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireSession, requireMasterWrite } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import {
  chequeDeposit,
  chequeAccreditation,
  chequeRejection,
  valueIdentity,
  valueQuery,
} from "./validation.js";
import type { ValuesStore } from "./store.js";
function chequeAction<T>(
  schema: z.ZodType<T>,
  save: (input: T, user: string, key: string) => Promise<unknown>,
  label: string,
): RequestHandler {
  return async (req, res) => {
    const input = schema.safeParse(req.body);
    if (!input.success)
      throw new MasterRequestError(
        400,
        `Revisá los datos de ${label}.`,
        Object.fromEntries(
          input.error.issues.map((i) => [
            String(i.path[0] ?? "formulario"),
            i.message,
          ]),
        ),
      );
    const key = z.string().uuid().safeParse(req.get("Idempotency-Key"));
    if (!key.success)
      throw new MasterRequestError(
        400,
        "Falta una clave válida para controlar los reintentos.",
      );
    res.json(
      await save(
        input.data,
        (res.locals.session as SessionResponse).usuario.id,
        key.data,
      ),
    );
  };
}
export function valuesRouter(auth: AuthService, store: ValuesStore) {
  const r = Router();
  r.use(requireSession(auth));
  r.get("/CHEQUE/:id/rechazo", async (req, res) => {
    const identity = valueIdentity.safeParse({
      family: "CHEQUE",
      id: req.params.id,
    });
    if (!identity.success)
      throw new MasterRequestError(400, "Seleccioná un cheque válido.");
    res.json(await store.rejectionPreview(identity.data.id));
  });
  r.post("/CHEQUE/:id/rechazar", ...requireMasterWrite, async (req, res) => {
    const identity = valueIdentity.safeParse({
      family: "CHEQUE",
      id: req.params.id,
    });
    const input = chequeRejection.safeParse(req.body);
    if (!identity.success || !input.success)
      throw new MasterRequestError(
        400,
        "Revisá los datos del rechazo.",
        !input.success
          ? Object.fromEntries(
              input.error.issues.map((i) => [
                String(i.path[0] ?? "formulario"),
                i.message,
              ]),
            )
          : undefined,
      );
    const version = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
    const key = z.string().uuid().safeParse(req.get("Idempotency-Key"));
    if (!version || !key.success)
      throw new MasterRequestError(
        400,
        "Volvé a abrir el rechazo antes de confirmar.",
      );
    res.json(
      await store.reject(
        identity.data.id,
        input.data,
        version,
        (res.locals.session as SessionResponse).usuario.id,
        key.data,
      ),
    );
  });
  r.post(
    "/depositos",
    ...requireMasterWrite,
    chequeAction(chequeDeposit, store.deposit, "depósito"),
  );
  r.post(
    "/acreditaciones",
    ...requireMasterWrite,
    chequeAction(chequeAccreditation, store.accredit, "acreditación"),
  );
  r.get("/", async (req, res) => {
    const q = valueQuery.safeParse(req.query);
    if (!q.success)
      throw new MasterRequestError(
        400,
        "Revisá los filtros y la página solicitada.",
      );
    res.json(await store.list(q.data));
  });
  r.get("/:family/:id", async (req, res) => {
    const identity = valueIdentity.safeParse(req.params);
    if (!identity.success)
      throw new MasterRequestError(400, "Seleccioná un valor válido.");
    res.json(await store.detail(identity.data.family, identity.data.id));
  });
  r.use((req, res) => {
    if (!["GET", "HEAD"].includes(req.method))
      res.set("Allow", "GET, HEAD").status(405).json({
        error: "La acción solicitada no está disponible para este valor.",
      });
    else res.status(404).json({ error: "Recurso no encontrado." });
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
    const e = error as { code?: unknown };
    console.error(
      JSON.stringify({
        evento: "valores.error",
        referencia,
        codigo:
          typeof e?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(e.code)
            ? e.code
            : "ERROR_INTERNO",
      }),
    );
    res
      .status(500)
      .json({ error: "No se pudo completar la operación.", referencia });
  };
  r.use(errors);
  return r;
}
