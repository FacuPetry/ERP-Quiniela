import {
  Router,
  type ErrorRequestHandler,
  type Response,
  type Request,
} from "express";
import type { MasterDetail, MasterRecord, SessionResponse } from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireMasterWrite, requireSession } from "../auth/middleware.js";
import {
  definition,
  listQuery,
  MasterRequestError,
  recordSchema,
} from "./validation.js";
import type { MasterStore } from "./store.js";

export function masterRouter(auth: AuthService, store: MasterStore) {
  const router = Router();
  router.use(requireSession(auth));
  router.get("/clientes/meta/siguiente-codigo", async (_req, res) => {
    res.json(await store.suggestClientCode());
  });
  router.get("/:master", async (req, res) => {
    const master = definition(param(req, "master"));
    const query = listQuery.safeParse(req.query);
    if (!query.success)
      throw new MasterRequestError(
        400,
        "Revisá los filtros y la página solicitada.",
      );
    res.json(await store.list(master, query.data));
  });
  router.get("/:master/:code", async (req, res) => {
    sendDetail(
      res,
      await store.get(definition(param(req, "master")), param(req, "code")),
    );
  });
  router.post("/:master", ...requireMasterWrite, async (req, res) => {
    const master = definition(param(req, "master"));
    const input = parseBody(master.key, req.body, true);
    const user = (res.locals.session as SessionResponse).usuario;
    sendDetail(
      res,
      (await store.write(master, "ALTA", input, input.Codigo, user.id))!,
      201,
    );
  });
  router.put("/:master/:code", ...requireMasterWrite, async (req, res) => {
    const master = definition(param(req, "master"));
    const input = parseBody(master.key, req.body);
    const user = (res.locals.session as SessionResponse).usuario;
    sendDetail(
      res,
      (await store.write(
        master,
        "MODIFICACION",
        input,
        param(req, "code"),
        user.id,
        version(req),
      ))!,
    );
  });
  router.delete("/:master/:code", ...requireMasterWrite, async (req, res) => {
    const master = definition(param(req, "master"));
    const user = (res.locals.session as SessionResponse).usuario;
    await store.write(
      master,
      "BAJA",
      null,
      param(req, "code"),
      user.id,
      version(req),
    );
    res.status(204).end();
  });
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof MasterRequestError)) {
      next(error);
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

function version(req: Request) {
  return /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
}
function param(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== "string")
    throw new MasterRequestError(404, "Recurso no encontrado.");
  return value;
}
function sendDetail(res: Response, detail: MasterDetail, status = 200) {
  res.setHeader("ETag", '"' + detail.version + '"');
  res.status(status).json(detail);
}

function parseBody(key: string, body: unknown, creation = false): MasterRecord {
  const result = recordSchema(definition(key), creation).safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues)
      if (issue.path[0] && !fields[String(issue.path[0])])
        fields[String(issue.path[0])] = issue.message;
    throw new MasterRequestError(
      400,
      "Revisá los campos indicados. Solo se admiten los campos de este formulario.",
      fields,
    );
  }
  return result.data as MasterRecord;
}
