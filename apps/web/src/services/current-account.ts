import type {
  CurrentAccountInput,
  CurrentAccountDetail,
  CurrentAccountOptions,
  CurrentAccountList,
} from "@erp/shared";
import { apiRequest } from "./http";
export const accountOptions = (signal?: AbortSignal) =>
  apiRequest<CurrentAccountOptions>(
    "/cuenta-corriente/opciones",
    signal ? { signal } : undefined,
  );
export const accountList = (
  query: Record<string, string>,
  signal: AbortSignal,
) =>
  apiRequest<CurrentAccountList>(
    "/cuenta-corriente?" + new URLSearchParams(query),
    { signal },
  );
export const accountDetail = (id: string) =>
  apiRequest<CurrentAccountDetail>(
    "/cuenta-corriente/" + encodeURIComponent(id),
  );
const writeHeaders = (csrf: string, key: string) => ({
  "Content-Type": "application/json",
  "X-ERP-Request": "1",
  "X-CSRF-Token": csrf,
  "Idempotency-Key": key,
});
export const createAccount = (
  input: CurrentAccountInput,
  csrf: string,
  key: string,
) =>
  apiRequest<CurrentAccountDetail>("/cuenta-corriente", {
    method: "POST",
    headers: writeHeaders(csrf, key),
    body: JSON.stringify(input),
  });
export const cancelAccount = (
  detail: CurrentAccountDetail,
  reason: string,
  csrf: string,
  key: string,
) =>
  apiRequest<CurrentAccountDetail>(
    "/cuenta-corriente/" + detail.registro.IDTabla + "/anular",
    {
      method: "POST",
      headers: {
        ...writeHeaders(csrf, key),
        "If-Match": '"' + detail.version + '"',
      },
      body: JSON.stringify({ Motivo: reason }),
    },
  );
