import type {
  CashOptions,
  CashReversalPreview,
  CashList,
  CashDetail,
  CashInput,
  TreasuryInput,
  PendingList,
  ValueDetail,
} from "@erp/shared";
import { apiRequest } from "./http";
const base = "/caja-movimiento";
export const cashOpeningStatus = (id: string, signal: AbortSignal) =>
  apiRequest<{
    IDTabla: string;
    Caja: string;
    CajaNombre: string;
    Estado: string;
    Activo: string;
  }>(base + "/cajas/" + encodeURIComponent(id) + "/estado", { signal });
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
export const cashCheque = (id: string, signal: AbortSignal) =>
  apiRequest<Record<string, string | null>>(
    base + "/cheques/" + encodeURIComponent(id),
    { signal },
  );

/** Mismo transporte y contratos de consulta/corrección para ambas operatorias. */
function movementServices<Input extends CashInput | TreasuryInput>(
  base: string,
) {
  const correction = (
    action: string,
    d: CashDetail,
    input: unknown,
    csrf: string,
    key: string,
  ) =>
    apiRequest<CashDetail>(base + "/" + d.registro.IDTabla + "/" + action, {
      method: "POST",
      headers: { ...headers(csrf, key), "If-Match": '"' + d.version + '"' },
      body: JSON.stringify(input),
    });
  return {
    options: (signal?: AbortSignal) =>
      apiRequest<CashOptions>(
        base + "/opciones",
        signal ? { signal } : undefined,
      ),
    list: (q: Record<string, string>, signal: AbortSignal) =>
      apiRequest<CashList>(base + "?" + new URLSearchParams(q), { signal }),
    detail: (id: string, signal?: AbortSignal) =>
      apiRequest<CashDetail>(
        base + "/" + encodeURIComponent(id),
        signal ? { signal } : undefined,
      ),
    save: (input: Input, csrf: string, key: string) =>
      apiRequest<CashDetail>(base, {
        method: "POST",
        headers: headers(csrf, key),
        body: JSON.stringify(input),
      }),
    reversalPreview: (id: string, signal: AbortSignal, cajaSaldo?: string) =>
      apiRequest<CashReversalPreview>(
        base +
          "/" +
          encodeURIComponent(id) +
          "/reversion" +
          (cajaSaldo
            ? "?" + new URLSearchParams({ CajaSaldo: cajaSaldo })
            : ""),
        { signal },
      ),
    reverse: (
      d: CashDetail,
      input: { CajaSaldo: string; Motivo: string },
      csrf: string,
      key: string,
    ) => correction("revertir", d, input, csrf, key),
    annul: (
      d: CashDetail,
      input: {
        CajaSaldo: string;
        Motivo: string;
        ConfirmarCorreccionBancaria: boolean;
      },
      csrf: string,
      key: string,
    ) => correction("anular", d, input, csrf, key),
  };
}
export type MovementServices = Omit<
  ReturnType<typeof movementServices<CashInput>>,
  "save"
>;
export const cashServices = movementServices<CashInput>(base);
export const treasuryServices = movementServices<TreasuryInput>("/tesoreria");
export const cashOptions = cashServices.options;
export const cashList = cashServices.list;
export const cashDetail = cashServices.detail;
export const cashSave = cashServices.save;
export const cashReversalPreview = cashServices.reversalPreview;
export const cashReverse = cashServices.reverse;
export const cashAnnul = cashServices.annul;
