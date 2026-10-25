import type {
  MasterDetail,
  MasterKey,
  MasterList,
  MasterRecord,
  ClientCodeSuggestion,
} from "@erp/shared";
import { masterDefinitions } from "@erp/shared";
import { apiRequest } from "./http";

export function suggestClientCode(signal?: AbortSignal) {
  return apiRequest<ClientCodeSuggestion>(
    "/maestros/clientes/meta/siguiente-codigo",
    signal ? { signal } : undefined,
  );
}

/** Carga completa, sin limitar el combo a la primera página de cien filas. */
export async function referenceOptions(
  key: MasterKey,
  query: Record<string, string>,
  signal?: AbortSignal,
) {
  const options = new Map<string, MasterRecord>();
  for (let page = 1; ; page++) {
    const result = await listMasters(
      key,
      { ...query, estado: "activo", pagina: String(page), limite: "100" },
      signal,
    );
    result.registros
      .filter((row) => row.Activo)
      .forEach((row) => options.set(row.Codigo, row));
    if (!result.registros.length || page * result.limite >= result.total) break;
  }
  return [...options.values()];
}

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
      body: JSON.stringify(
        !previous && masterDefinitions[key].automaticCode
          ? Object.fromEntries(
              Object.entries(record).filter(([field]) => field !== "Codigo"),
            )
          : record,
      ),
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
