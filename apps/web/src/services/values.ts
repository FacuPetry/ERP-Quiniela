import type {
  ValueRecordDetail,
  ValueFamily,
  ValueList,
  ChequeDepositInput,
  ChequeDepositResult,
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
export const depositCheques = (
  input: ChequeDepositInput,
  csrf: string,
  key: string,
) =>
  apiRequest<ChequeDepositResult>("/valores/depositos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  });
