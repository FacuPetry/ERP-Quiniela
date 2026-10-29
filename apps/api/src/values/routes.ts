import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { SessionResponse } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireSession, requireMasterWrite } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import { chequeDeposit, valueIdentity, valueQuery } from "./validation.js";
import type { ValuesStore } from "./store.js";
export function valuesRouter(auth: AuthService, store: ValuesStore) {
  const r = Router();
  r.use(requireSession(auth));
  r.post("/depositos", ...requireMasterWrite, async (req, res) => {
    const input = chequeDeposit.safeParse(req.body);
    if (!input.success)
      throw new MasterRequestError(
        400,
        "Revisá los datos del depósito.",
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
      await store.deposit(
        input.data,
        (res.locals.session as SessionResponse).usuario.id,
        key.data,
      ),
    );
  });
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
