/** Contratos HTTP; no contienen acceso a datos ni configuración sensible. */
export * from './masters.js';
export * from './comprobantes.js';
export interface HealthResponse {
  status: 'ok';
  service: 'erp-quiniela-api';
}

export interface ReadinessResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'unavailable';
}

export interface ApiError {
  error: string;
}

/** Los importes y BIGINT se transportan como texto para preservar precisión. */
export type DecimalAmount = string;
export type RecordId = string;

export interface CurrentUser {
  id: RecordId;
  nombre: string;
  email: string;
  rol: { codigo: string; nombre: string };
}

export interface SessionResponse {
  usuario: CurrentUser;
  csrfToken: string;
  venceEn: string;
}

export * from './current-account.js';
