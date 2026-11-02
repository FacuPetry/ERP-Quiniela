import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import type { AuthService } from "../auth/service.js";
import { requireSession, requireMenu } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import type { ReportStore } from "./store.js";
import {
  cashReportQuery,
  ledgerQuery,
  summaryQuery,
  chequeReportQuery,
  chequeReportId,
} from "./validation.js";
export function reportsRouter(auth: AuthService, store: ReportStore) {
  const r = Router();
  r.use(requireSession(auth));
  r.get(
    "/caja/diario",
    requireMenu("resumen-diario-caja"),
    async (req, res) => {
      const q = cashReportQuery.safeParse(req.query);
      if (!q.success)
        throw new MasterRequestError(
          400,
          "Revisá la caja, el estado y el rango de fechas.",
        );
      res.json(await store.dailyCash(q.data));
    },
  );
  r.get(
    "/cuenta-corriente",
    requireMenu("informes-cuenta-corriente"),
    async (req, res) => {
      const q = summaryQuery.safeParse(req.query);
      if (!q.success)
        throw new MasterRequestError(
          400,
          "Revisá los filtros y la página solicitada.",
        );
      res.json(await store.accountSummary(q.data));
    },
  );
  r.get(
    "/cuenta-corriente/resumen",
    requireMenu("resumen-cuenta-corriente"),
    async (req, res) => {
      const q = ledgerQuery.safeParse(req.query);
      if (!q.success)
        throw new MasterRequestError(
          400,
          "Seleccioná un cliente válido y revisá la página solicitada.",
        );
      res.json(await store.accountLedger(q.data));
    },
  );
  r.get(
    "/cheques/terceros",
    requireMenu("informe-cheques-terceros"),
    async (req, res) => {
      const q = chequeReportQuery.safeParse(req.query);
      if (!q.success)
        throw new MasterRequestError(
          400,
          "Revisá los filtros de cheques y el rango de fechas.",
        );
      res.json(await store.thirdPartyCheques(q.data));
    },
  );
  r.get(
    "/cheques/terceros/:id",
    requireMenu("informe-cheques-terceros"),
    async (req, res) => {
      const id = chequeReportId.safeParse(req.params.id);
      if (!id.success)
        throw new MasterRequestError(400, "Seleccioná un cheque válido.");
      res.json(await store.thirdPartyChequeDetail(id.data));
    },
  );
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
