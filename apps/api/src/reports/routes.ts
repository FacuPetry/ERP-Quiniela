import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import type { AuthService } from "../auth/service.js";
import { requireSession, requireMenu } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import type { ReportStore } from "./store.js";
import { summaryQuery } from "./validation.js";
export function reportsRouter(auth: AuthService, store: ReportStore) {
  const r = Router();
  r.use(requireSession(auth), requireMenu("informes-cuenta-corriente"));
  r.get("/cuenta-corriente", async (req, res) => {
    const q = summaryQuery.safeParse(req.query);
    if (!q.success)
      throw new MasterRequestError(
        400,
        "Revisá los filtros y la página solicitada.",
      );
    res.json(await store.accountSummary(q.data));
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof MasterRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const referencia = randomUUID();
    console.error(
      JSON.stringify({
        evento: "informe.error",
        referencia,
        codigo: typeof error?.code === "string" ? error.code : "ERROR_INTERNO",
      }),
    );
    res
      .status(500)
      .json({ error: "No se pudo consultar el informe.", referencia });
  };
  r.use(errors);
  return r;
}
