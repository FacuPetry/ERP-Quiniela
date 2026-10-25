import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { csrfToken, equalToken } from "./crypto.js";
import { sessionLifetimeMs, type AuthService } from "./service.js";

export const sessionCookieName = "erp_sesion";

function readToken(req: Request) {
  const cookies = (req.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim());
  const values = cookies.filter((value) =>
    value.startsWith(`${sessionCookieName}=`),
  );
  if (values.length !== 1) return null;
  const token = values[0]!.slice(sessionCookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

// No se habilita CORS. El encabezado propio exige preflight desde otros orígenes.
const requireApplicationRequest: RequestHandler = (req, res, next) => {
  if (
    req.get("X-ERP-Request") !== "1" ||
    !req.is("application/json") ||
    req.get("Sec-Fetch-Site") === "cross-site"
  ) {
    res.status(403).json({ error: "Solicitud no permitida." });
    return;
  }
  next();
};

function loginLimiter(): RequestHandler {
  const windowMs = 15 * 60 * 1000;
  const attempts = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 150)
        : "";
    // No confiar en X-Forwarded-For enviado por el cliente. El límite por IP puede
    // agrupar usuarios detrás del proxy; el límite por correo también se aplica.
    const keys = [
      { key: `ip:${req.ip ?? req.socket.remoteAddress}`, limit: 30 },
      { key: `email:${email}`, limit: 10 },
    ];
    const blocked = keys
      .map(({ key, limit }) => {
        const value = attempts.get(key);
        return value && value.count >= limit ? value : undefined;
      })
      .find(Boolean);
    if (blocked || attempts.size >= 10000) {
      res.setHeader(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil(((blocked?.until ?? now + windowMs) - now) / 1000),
          ),
        ),
      );
      res
        .status(429)
        .json({
          error:
            "Demasiados intentos. Esperá unos minutos antes de volver a intentar.",
        });
      return;
    }
    keys.forEach(({ key }) => {
      const entry = attempts.get(key) ?? { count: 0, until: now + windowMs };
      entry.count++;
      attempts.set(key, entry);
    });
    next();
  };
}

export function authRouter(auth: AuthService, secureCookie: boolean) {
  const router = Router();
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
  };
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/me", async (req, res) => {
    const token = readToken(req);
    const session = token ? await auth.current(token) : null;
    if (!session) {
      res.clearCookie(sessionCookieName, cookieOptions);
      res.status(401).json({ error: "Ingresá para continuar." });
      return;
    }
    res.json(session);
  });

  router.post(
    "/login",
    requireApplicationRequest,
    loginLimiter(),
    async (req, res) => {
      const parsed = z
        .object({
          email: z.email().max(150),
          password: z.string().min(1).max(128),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Ingresá un correo válido y tu contraseña." });
        return;
      }
      const result = await auth.login(parsed.data.email, parsed.data.password);
      if (!result) {
        res.status(401).json({ error: "Correo o contraseña incorrectos." });
        return;
      }
      const previous = readToken(req);
      if (previous) await auth.logout(previous);
      res.cookie(sessionCookieName, result.token, {
        ...cookieOptions,
        maxAge: sessionLifetimeMs,
      });
      res.json(result.session);
    },
  );

  router.post("/logout", requireApplicationRequest, async (req, res) => {
    const token = readToken(req);
    if (
      !token ||
      !equalToken(req.get("X-CSRF-Token") ?? "", csrfToken(token))
    ) {
      res
        .status(403)
        .json({
          error:
            "Solicitud no permitida. Actualizá la página e intentá nuevamente.",
        });
      return;
    }
    await auth.logout(token);
    res.clearCookie(sessionCookieName, cookieOptions);
    res.status(204).end();
  });
  router.use((_req, res) => {
    res.status(404).json({ error: "Recurso no encontrado." });
  });
  return router;
}
