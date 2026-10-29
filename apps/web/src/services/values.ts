import type { ValueRecordDetail, ValueFamily, ValueList } from "@erp/shared";
import { apiRequest } from "./http";
export const valueList = (query: Record<string, string>, signal: AbortSignal) =>
  apiRequest<ValueList>("/valores?" + new URLSearchParams(query), { signal });
export const valueDetail = (
  family: ValueFamily,
  id: string,
  signal: AbortSignal,
) =>
  apiRequest<ValueRecordDetail>(`/valores/${family}/${encodeURIComponent(id)}`, {
    signal,
  });
