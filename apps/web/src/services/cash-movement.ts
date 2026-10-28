import type {
  CashOptions,
  CashReversalPreview,
  CashList,
  CashDetail,
  CashInput,
  PendingList,
  ValueDetail,
} from "@erp/shared";
import { apiRequest } from "./http";
const base = "/caja-movimiento";
export const cashOptions = (signal?: AbortSignal) =>
  apiRequest<CashOptions>(base + "/opciones", signal ? { signal } : undefined);
export const cashOpeningStatus = (id: string, signal: AbortSignal) =>
  apiRequest<{
    IDTabla: string;
    Caja: string;
    CajaNombre: string;
    Estado: string;
    Activo: string;
  }>(base + "/cajas/" + encodeURIComponent(id) + "/estado", { signal });
export const cashList = (q: Record<string, string>, signal: AbortSignal) =>
  apiRequest<CashList>(base + "?" + new URLSearchParams(q), { signal });
export const cashDetail = (id: string, signal?: AbortSignal) =>
  apiRequest<CashDetail>(
    base + "/" + encodeURIComponent(id),
    signal ? { signal } : undefined,
  );
export const pendingList = (q: Record<string, string>, signal: AbortSignal) =>
  apiRequest<PendingList>(base + "/pendientes?" + new URLSearchParams(q), {
    signal,
  });
export const portfolio = (q: Record<string, string>, signal: AbortSignal) =>
  apiRequest<{
    registros: ValueDetail[];
    total: number;
    pagina: number;
    limite: number;
  }>(base + "/cartera?" + new URLSearchParams(q), { signal });
const headers = (csrf: string, key: string) => ({
  "Content-Type": "application/json",
  "X-ERP-Request": "1",
  "X-CSRF-Token": csrf,
  "Idempotency-Key": key,
});
export const cashSave = (input: CashInput, csrf: string, key: string) =>
  apiRequest<CashDetail>(base, {
    method: "POST",
    headers: headers(csrf, key),
    body: JSON.stringify(input),
  });
export const cashOpen = (
  input: { Caja: string; SaldoInicial: string },
  csrf: string,
  key: string,
) =>
  apiRequest<{ IDTabla: string }>(base + "/cajas", {
    method: "POST",
    headers: headers(csrf, key),
    body: JSON.stringify(input),
  });
export const cashClose = (
  id: string,
  input: { SaldoContado: string; Observacion: string | null },
  csrf: string,
  key: string,
) =>
  apiRequest<{ SaldoTeorico: string; Diferencia: string }>(
    base + "/cajas/" + id + "/cerrar",
    {
      method: "POST",
      headers: headers(csrf, key),
      body: JSON.stringify(input),
    },
  );
export const cashReverse = (
  d: CashDetail,
  input: {
    CajaSaldo: string;
    Motivo: string;
  },
  csrf: string,
  key: string,
) =>
  apiRequest<CashDetail>(base + "/" + d.registro.IDTabla + "/revertir", {
    method: "POST",
    headers: { ...headers(csrf, key), "If-Match": '"' + d.version + '"' },
    body: JSON.stringify(input),
  });

export const cashCheque = (id: string, signal: AbortSignal) =>
  apiRequest<Record<string, string | null>>(
    base + "/cheques/" + encodeURIComponent(id),
    { signal },
  );

export const cashAnnul = (
  d: CashDetail,
  input: {
    CajaSaldo: string;
    Motivo: string;
    ConfirmarCorreccionBancaria: boolean;
  },
  csrf: string,
  key: string,
) =>
  apiRequest<CashDetail>(base + "/" + d.registro.IDTabla + "/anular", {
    method: "POST",
    headers: { ...headers(csrf, key), "If-Match": '"' + d.version + '"' },
    body: JSON.stringify(input),
  });

export const cashReversalPreview = (id: string, signal: AbortSignal) =>
  apiRequest<CashReversalPreview>(
    base + "/" + encodeURIComponent(id) + "/reversion",
    { signal },
  );
