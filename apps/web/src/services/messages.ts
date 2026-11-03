import type { BalanceMessagePreview } from "@erp/shared";
import { apiRequest } from "./http";

export function previewBalanceMessage(client: string, signal: AbortSignal) {
  return apiRequest<BalanceMessagePreview>(
    "/mensajes/vista-previa?" + new URLSearchParams({ Cliente: client }),
    { signal },
  );
}
