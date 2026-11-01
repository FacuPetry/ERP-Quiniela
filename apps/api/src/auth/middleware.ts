import type { RequestHandler } from "express";
import {
  canAccessMenu,
  canWriteMenu,
  type MenuKey,
  type SessionResponse,
} from "@erp/shared";
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
    if (
      session.usuario.rol.codigo !== "ADMIN" &&
      res.locals.canWrite !== true
    ) {
      res.status(403).json({
        error: "No tenés permiso para modificar los datos de este módulo.",
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

/** Evaluado con la cuenta actual en cada petición, sin confiar en el menú del cliente. */
export function requireMenu(...menus: MenuKey[]): RequestHandler {
  return (_req, res, next) => {
    const user = (res.locals.session as SessionResponse).usuario;
    if (!menus.some((menu) => canAccessMenu(user, menu))) {
      res
        .status(403)
        .json({ error: "No tenés acceso a esta opción del sistema." });
      return;
    }
    res.locals.canWrite = menus.some((menu) => canWriteMenu(user, menu));
    next();
  };
}
export const requireAdministrator: RequestHandler = (_req, res, next) => {
  if ((res.locals.session as SessionResponse).usuario.rol.codigo !== "ADMIN") {
    res.status(403).json({
      error: "La administración de usuarios requiere acceso de Administrador.",
    });
    return;
  }
  next();
};
