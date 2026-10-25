import type {
  MasterDetail,
  MasterKey,
  MasterList,
  MasterRecord,
} from "@erp/shared";
import { apiRequest } from "./http";

export function listMasters(
  key: MasterKey,
  query: Record<string, string>,
  signal?: AbortSignal,
) {
  return apiRequest<MasterList>(
    `/maestros/${key}?${new URLSearchParams(query)}`,
    signal ? { signal } : undefined,
  );
}
export function getMaster(key: MasterKey, code: string) {
  return apiRequest<MasterDetail>(
    `/maestros/${key}/${encodeURIComponent(code)}`,
  );
}
export function saveMaster(
  key: MasterKey,
  record: MasterRecord,
  csrf: string,
  previous?: MasterDetail,
) {
  return apiRequest<MasterDetail>(
    `/maestros/${key}${previous ? "/" + encodeURIComponent(previous.registro.Codigo) : ""}`,
    {
      method: previous ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": csrf,
        ...(previous ? { "If-Match": '"' + previous.version + '"' } : {}),
      },
      body: JSON.stringify(record),
    },
  );
}
export function deleteMaster(
  key: MasterKey,
  previous: MasterDetail,
  csrf: string,
) {
  return apiRequest<void>(
    `/maestros/${key}/${encodeURIComponent(previous.registro.Codigo)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": csrf,
        "If-Match": '"' + previous.version + '"',
      },
      body: "{}",
    },
  );
}
