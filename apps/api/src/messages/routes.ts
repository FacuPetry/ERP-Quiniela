import { randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { requireMenu, requireSession } from "../auth/middleware.js";
import { MasterRequestError } from "../masters/validation.js";
import type { MessageStore } from "./store.js";

const query = z.object({ Cliente: z.string().trim().min(1).max(20) }).strict();
export function messagesRouter(auth: AuthService, store: MessageStore) {
  const r = Router();
  r.use(requireSession(auth), requireMenu("envio-mensajes"));
  r.get("/vista-previa", async (req, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success)
      throw new MasterRequestError(400, "Seleccioná un cliente válido.");
    res.json(await store.preview(parsed.data.Cliente));
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
