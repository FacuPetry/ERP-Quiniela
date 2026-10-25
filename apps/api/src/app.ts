import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { HealthResponse, ReadinessResponse, ApiError } from '@erp/shared';
import { authRouter } from './auth/routes.js';
import type { AuthService } from './auth/service.js';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  webDist?: string;
  auth?: AuthService;
  secureCookie?: boolean;
}

export function createApp({ checkDatabase, webDist, auth, secureCookie = false }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'erp-quiniela-api' } satisfies HealthResponse);
  });
  app.get('/api/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'connected' } satisfies ReadinessResponse);
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' } satisfies ReadinessResponse);
    }
  });
  if (auth) app.use('/api/auth', authRouter(auth, secureCookie));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado.' } satisfies ApiError);
  });

  if (webDist) {
    const index = resolve(webDist, 'index.html');
    if (!existsSync(index)) throw new Error('Falta compilar el frontend. Ejecutar npm run build.');
    app.use(express.static(webDist, { index: false, dotfiles: 'ignore' }));
    app.use((req, res, next) => {
      const path = decodeURIComponent(req.path);
      const hiddenPath = path.split('/').some(part => part.startsWith('.'));
      if (req.method === 'GET' && !hiddenPath && !extname(path) && req.accepts('html')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(index);
      } else next();
    });
  }
  app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado.' } satisfies ApiError));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error &&
      typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({ error: status < 500 ? 'Solicitud inválida.' : 'No se pudo completar la solicitud.' } satisfies ApiError);
  };
  app.use(onError);
  return app;
}
