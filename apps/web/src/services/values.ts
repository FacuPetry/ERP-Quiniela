import type {
  ValueRecordDetail,
  ValueFamily,
  ValueList,
  ChequeDepositInput,
  ChequeDepositResult,
  ChequeAccreditationInput,
  ChequeAccreditationResult,
} from "@erp/shared";
import { apiRequest } from "./http";
export const valueList = (query: Record<string, string>, signal: AbortSignal) =>
  apiRequest<ValueList>("/valores?" + new URLSearchParams(query), { signal });
export const valueDetail = (
  family: ValueFamily,
  id: string,
  signal: AbortSignal,
) =>
  apiRequest<ValueRecordDetail>(
    `/valores/${family}/${encodeURIComponent(id)}`,
    {
      signal,
    },
  );
function saveChequeOperation<T>(
  action: string,
  input: ChequeAccreditationInput,
  csrf: string,
  key: string,
) {
  return apiRequest<T>(`/valores/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  });
}
export const depositCheques = (
  input: ChequeDepositInput,
  csrf: string,
  key: string,
) => saveChequeOperation<ChequeDepositResult>("depositos", input, csrf, key);
export const accreditCheques = (
  input: ChequeAccreditationInput,
  csrf: string,
  key: string,
) =>
  saveChequeOperation<ChequeAccreditationResult>(
    "acreditaciones",
    input,
    csrf,
    key,
  );
export const rejectionPreview = (id: string, signal: AbortSignal) =>
  apiRequest<import("@erp/shared").ChequeRejectionPreview>(
    `/valores/CHEQUE/${encodeURIComponent(id)}/rechazo`,
    { signal },
  );
export const rejectCheque = (
  id: string,
  input: import("@erp/shared").ChequeRejectionInput,
  version: string,
  csrf: string,
  key: string,
) =>
  apiRequest<import("@erp/shared").ChequeRejectionResult>(
    `/valores/CHEQUE/${encodeURIComponent(id)}/rechazar`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
        "If-Match": `"${version}"`,
      },
      body: JSON.stringify(input),
    },
  );
