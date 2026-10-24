import type { HealthResponse, ReadinessResponse } from '@erp/shared';

export async function getServiceStatus(signal: AbortSignal) {
  const [api, database] = await Promise.allSettled([
    fetch('/api/health', { signal }).then(async response => {
      if (!response.ok) throw new Error('API no disponible');
      const body: HealthResponse = await response.json();
      if (body.status !== 'ok' || body.service !== 'erp-quiniela-api') throw new Error('Respuesta inesperada');
      return body;
    }),
    fetch('/api/ready', { signal }).then(async response => {
      if (!response.ok) throw new Error('Base de datos no disponible');
      const body: ReadinessResponse = await response.json();
      if (body.status !== 'ok' || body.database !== 'connected') throw new Error('Respuesta inesperada');
      return body;
    }),
  ]);
  return { api: api.status === 'fulfilled', database: database.status === 'fulfilled' };
}
