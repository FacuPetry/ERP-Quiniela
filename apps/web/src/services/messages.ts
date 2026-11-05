import type {
  BalanceMessagePreview,
  MessageTemplatePreference,
  ClientMessagesResult,
} from "@erp/shared";
import { apiRequest } from "./http";

export function previewBalanceMessage(client: string, signal: AbortSignal) {
  return apiRequest<BalanceMessagePreview>(
    "/mensajes/vista-previa?" + new URLSearchParams({ Cliente: client }),
    { signal },
  );
}
export function listClientMessages(
  parameters: Record<string, string>,
  signal: AbortSignal,
) {
  return apiRequest<ClientMessagesResult>(
    "/mensajes/clientes?" + new URLSearchParams(parameters),
    { signal },
  );
}
export function getMessageTemplate(signal: AbortSignal) {
  return apiRequest<MessageTemplatePreference>("/mensajes/plantilla", {
    signal,
  });
}
export function saveMessageTemplate(
  Plantilla: string | null,
  version: string,
  csrf: string,
  signal: AbortSignal,
) {
  return apiRequest<MessageTemplatePreference>("/mensajes/plantilla", {
    method: "PUT",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
      "If-Match": `"${version}"`,
    },
    body: JSON.stringify({ Plantilla }),
  });
}

export function registerMessageNotice(
  RegistroToken: string,
  Plantilla: string,
  csrf: string,
  key: string,
) {
  return apiRequest<import("@erp/shared").MessageNotice>("/mensajes/avisos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ RegistroToken, Plantilla, Confirmado: true }),
  });
}
export function listMessageNotices(
  Cliente: string,
  pagina: number,
  signal: AbortSignal,
) {
  return apiRequest<import("@erp/shared").MessageNoticesResult>(
    "/mensajes/avisos?" +
      new URLSearchParams({ Cliente, pagina: String(pagina) }),
    { signal },
  );
}
