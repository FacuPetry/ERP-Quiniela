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
export function selectedClientMessages(
  Clientes: string[],
  parameters: Record<string, string>,
  csrf: string,
  signal: AbortSignal,
) {
  return apiRequest<ClientMessagesResult>("/mensajes/clientes/seleccionados", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ Clientes, ...parameters }),
  });
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
