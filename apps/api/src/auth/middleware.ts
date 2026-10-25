import type { RequestHandler } from "express";
import type { SessionResponse } from "@erp/shared";
import { readToken, requireApplicationRequest } from "./routes.js";
import { equalToken } from "./crypto.js";
import type { AuthService } from "./service.js";

export function requireSession(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const token = readToken(req);
    const session = token ? await auth.current(token) : null;
    if (!session) {
      res.status(401).json({ error: "Tu sesión terminó. Ingresá nuevamente." });
      return;
    }
    res.locals.session = session;
    next();
  };
}

export const requireMasterWrite: RequestHandler[] = [
  requireApplicationRequest,
  (req, res, next) => {
    const session = res.locals.session as SessionResponse;
    if (session.usuario.rol.codigo !== "ADMIN") {
      res
        .status(403)
        .json({
          error:
            "Tu perfil permite consultar estos datos. La edición requiere el rol Administrador.",
        });
      return;
    }
    if (!equalToken(req.get("X-CSRF-Token") ?? "", session.csrfToken)) {
      res
        .status(403)
        .json({ error: "Actualizá la página antes de guardar los cambios." });
      return;
    }
    next();
  },
];
