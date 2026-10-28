import {
  Router,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { SessionResponse, CashModule } from "@erp/shared";
import { requireSession, requireMasterWrite } from "../auth/middleware.js";
import type { AuthService } from "../auth/service.js";
import { MasterRequestError } from "../masters/validation.js";
import type { CashMovementStore } from "./store.js";
import {
  creation,
  treasuryCreation,
  query,
  pendingQuery,
  opening,
  closing,
  reversal,
  annulment,
} from "./validation.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new MasterRequestError(
      400,
      "Revisá los campos indicados.",
      Object.fromEntries(
        r.error.issues.map((i) => [
          String(i.path[0] ?? "formulario"),
          i.message,
        ]),
      ),
    );
  return r.data;
}
function key(req: Request) {
  const key = req.get("Idempotency-Key") ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(key))
    throw new MasterRequestError(
      400,
      "Falta una clave válida para controlar los reintentos.",
    );
  return key;
}
function user(res: Response) {
  return (res.locals.session as SessionResponse).usuario.id;
}
export function cashMovementRouter(
  auth: AuthService,
  store: CashMovementStore,
  module: CashModule = "COBROSPAGOS",
) {
  const r = Router();
  r.use(requireSession(auth));
  r.get("/opciones", async (_req, res) => {
    res.json(await store.options());
  });
  if (module === "COBROSPAGOS") {
    r.get("/pendientes", async (req, res) => {
      res.json(await store.pending(parse(pendingQuery, req.query)));
    });
    r.get("/cheques/:id", async (req, res) => {
      res.json(await store.cheque(String(req.params.id)));
    });
    r.get("/cartera", async (req, res) => {
      const q = parse(query, req.query);
      res.json(await store.portfolio(q));
    });
  }
  if (module === "COBROSPAGOS") {
    r.get("/cajas/:id/estado", async (req, res) => {
      res.json(await store.openingStatus(String(req.params.id)));
    });
    r.post("/cajas", ...requireMasterWrite, async (req, res) => {
      res
        .status(201)
        .json(await store.open(parse(opening, req.body), user(res), key(req)));
    });
    r.post("/cajas/:id/cerrar", ...requireMasterWrite, async (req, res) => {
      res.json(
        await store.close(
          String(req.params.id),
          parse(closing, req.body),
          user(res),
          key(req),
        ),
      );
    });
  }
  r.get("/", async (req, res) => {
    res.json(await store.list(parse(query, req.query)));
  });
  r.post("/", ...requireMasterWrite, async (req, res) => {
    const treasury =
      module === "TESORERIA" ? parse(treasuryCreation, req.body) : null;
    const input = treasury
      ? {
          Comprobante: treasury.Comprobante,
          NumeroComprobante: treasury.NumeroComprobante,
          CajaSaldo: treasury.CajaSaldo,
          Concepto: treasury.Concepto,
          FechaOrigen: treasury.FechaOrigen,
          Observacion: treasury.Observacion,
          ImporteEfectivo: treasury.Importe,
          ImporteACuenta: "0.00",
          Cliente: "",
          Afectaciones: [],
          Valores: [],
        }
      : parse(creation, req.body);
    const result = await store.create(input, user(res), key(req));
    res
      .set("ETag", '"' + result.version + '"')
      .status(201)
      .json(result);
  });
  r.post("/:id/anular", ...requireMasterWrite, async (req, res) => {
    const version = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
    if (!version)
      throw new MasterRequestError(
        400,
        "Volvé a abrir el movimiento antes de anularlo.",
      );
    const result = await store.annul(
      String(req.params.id),
      parse(annulment, req.body),
      version,
      user(res),
      key(req),
    );
    res.set("ETag", '"' + result.version + '"').json(result);
  });
  r.get("/:id/reversion", async (req, res) => {
    res.json(await store.reversalPreview(String(req.params.id)));
  });
  r.post("/:id/revertir", ...requireMasterWrite, async (req, res) => {
    const version = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
    if (!version)
      throw new MasterRequestError(
        400,
        "Volvé a abrir el movimiento antes de revertirlo.",
      );
    const result = await store.reverse(
      String(req.params.id),
      parse(reversal, req.body),
      version,
      user(res),
      key(req),
    );
    res.set("ETag", '"' + result.version + '"').json(result);
  });
  r.get("/:id", async (req, res) => {
    const d = await store.get(String(req.params.id));
    res.set("ETag", '"' + d.version + '"').json(d);
  });
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    if (error instanceof MasterRequestError && error.status < 500) {
      res.status(error.status).json({
        error: error.message,
        ...(error.campos ? { campos: error.campos } : {}),
      });
      return;
    }
    const referencia = randomUUID();
    const e = (error && typeof error === "object" ? error : {}) as Record<
      string,
      unknown
    >;
    console.error(
      JSON.stringify({
        evento:
          module === "TESORERIA" ? "tesoreria.error" : "caja_movimiento.error",
        referencia,
        metodo: req.method,
        ruta: req.route?.path,
        codigo:
          typeof e.code === "string" && /^[A-Z0-9_]{1,64}$/.test(e.code)
            ? e.code
            : "ERROR_INTERNO",
        errno: typeof e.errno === "number" ? e.errno : undefined,
      }),
    );
    res
      .status(500)
      .json({ error: "No se pudo completar la operación.", referencia });
  };
  r.use(errors);
  return r;
}
