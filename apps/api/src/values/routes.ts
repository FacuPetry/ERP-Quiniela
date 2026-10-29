import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import type { AuthService } from "../auth/service.js";
import { requireSession } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import { valueIdentity, valueQuery } from "./validation.js";
import type { ValuesStore } from "./store.js";
export function valuesRouter(auth: AuthService, store: ValuesStore) {
  const r = Router();
  r.use(requireSession(auth));
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
      res
        .set("Allow", "GET, HEAD")
        .status(405)
        .json({ error: "Valores es un módulo de consulta." });
    else res.status(404).json({ error: "Recurso no encontrado." });
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof MasterRequestError) {
      res.status(error.status).json({ error: error.message });
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
      .json({ error: "No se pudo completar la consulta.", referencia });
  };
  r.use(errors);
  return r;
}
