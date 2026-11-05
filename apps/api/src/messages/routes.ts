import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import {
  messageTemplateProblem,
  maxMessageTemplateLength,
  type SessionResponse,
} from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireMenu, requireSession } from "../auth/middleware.js";
import { requireApplicationRequest } from "../auth/routes.js";
import { equalToken } from "../auth/crypto.js";
import { MasterRequestError } from "../masters/validation.js";
import type { MessageStore } from "./store.js";
import { messageClientsQuery } from "./validation.js";

const query = z.object({ Cliente: z.string().trim().min(1).max(20) }).strict();
const templateInput = z
  .object({
    Plantilla: z
      .string()
      .max(maxMessageTemplateLength)
      .refine((value) => !messageTemplateProblem(value))
      .nullable(),
  })
  .strict();
export function messagesRouter(auth: AuthService, store: MessageStore) {
  const r = Router();
  r.use(requireSession(auth), requireMenu("envio-mensajes"));
  r.get("/clientes", async (req, res) => {
    const parsed = messageClientsQuery.safeParse(req.query);
    if (!parsed.success)
      throw new MasterRequestError(
        400,
        "Revisá los filtros de clientes y la página solicitada.",
      );
    res.json(
      await store.clients(
        parsed.data,
        (res.locals.session as SessionResponse).usuario.id,
      ),
    );
  });
  r.get("/plantilla", async (_req, res) => {
    const session = res.locals.session as SessionResponse;
    res.json(await store.template(session.usuario.id));
  });
  r.put("/plantilla", requireApplicationRequest, async (req, res) => {
    const session = res.locals.session as SessionResponse;
    if (!equalToken(req.get("X-CSRF-Token") ?? "", session.csrfToken))
      throw new MasterRequestError(
        403,
        "Actualizá la página antes de guardar el mensaje.",
      );
    const version = /^"([a-f0-9]{64})"$/.exec(req.get("If-Match") ?? "")?.[1];
    if (!version)
      throw new MasterRequestError(
        400,
        "Volvé a cargar el mensaje antes de guardar.",
      );
    const parsed = templateInput.safeParse(req.body);
    if (!parsed.success)
      throw new MasterRequestError(
        400,
        "Revisá el texto y las variables del mensaje.",
      );
    res.json(
      await store.saveTemplate(
        session.usuario.id,
        parsed.data.Plantilla,
        version,
      ),
    );
  });
  r.get("/vista-previa", async (req, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success)
      throw new MasterRequestError(400, "Seleccioná un cliente válido.");
    res.json(
      await store.preview(
        parsed.data.Cliente,
        (res.locals.session as SessionResponse).usuario.id,
      ),
    );
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof MasterRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const referencia = randomUUID();
    console.error(
      JSON.stringify({
        evento: "mensajes.error",
        referencia,
        codigo: typeof error?.code === "string" ? error.code : "ERROR_INTERNO",
      }),
    );
    res.status(500).json({
      error: "No se pudo preparar el mensaje.",
      referencia,
    });
  };
  r.use(errors);
  return r;
}
