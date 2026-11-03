import type { CashJourneyReport, CashJourneyRow } from "@erp/shared";
import { apiRequest } from "../../services/http";
import { displayDate, displayDateTime } from "../controls/date-value";
import { amount } from "../cash-movement/format";
import type { TableColumn, TableTotals } from "../ui/DataTable";
import { buildReportDocument } from "./report-document";

const money = (value: string | null) => (value == null ? "—" : amount(value));
const title = "Detalle de movimientos por caja/jornada";
const columns: TableColumn<CashJourneyRow>[] = [
  {
    key: "RegistradoEn",
    label: "Registro",
    render: (r) => displayDateTime(r.RegistradoEn),
  },
  {
    key: "FechaOrigen",
    label: "Fecha de origen",
    render: (r) => displayDate(r.FechaOrigen),
  },
  {
    key: "ComprobanteDescripcion",
    label: "Comprobante",
    render: (r) =>
      `${r.ComprobanteDescripcion}${r.EsReverso ? " · Reversión" : r.Estado === "REVERTIDO" ? " · Revertido" : ""}`,
  },
  {
    key: "NumeroComprobanteTexto",
    label: "Número",
    render: (r) => r.NumeroComprobanteTexto,
  },
  {
    key: "Detalle",
    label: "Cliente / Concepto / Detalle",
    render: (r) => r.Detalle,
  },
  {
    key: "UsuarioNombre",
    label: "Responsable",
    render: (r) => r.UsuarioNombre,
  },
  {
    key: "IngresoEfectivo",
    label: "Ingresos efectivo",
    align: "right",
    render: (r) => money(r.IngresoEfectivo),
  },
  {
    key: "EgresoEfectivo",
    label: "Egresos efectivo",
    align: "right",
    render: (r) => money(r.EgresoEfectivo),
  },
  {
    key: "OtrosMediosNeto",
    label: "Otros medios (+/−)",
    align: "right",
    render: (r) => money(r.OtrosMediosNeto),
  },
  {
    key: "SaldoAcumulado",
    label: "Saldo efectivo",
    align: "right",
    render: (r) => money(r.SaldoAcumulado),
  },
];
export const cashJourneySummary = (data: CashJourneyReport) => {
  const o = data.jornada;
  return `${o.CajaNombre} · Apertura: ${displayDateTime(o.AperturaEn)} · ${o.Estado === "CERRADO" ? "Cierre: " + displayDateTime(o.CierreEn) : "Jornada abierta"} · Abrió: ${o.UsuarioAperturaNombre}${o.UsuarioCierreNombre ? " · Cerró: " + o.UsuarioCierreNombre : ""}`;
};
const openingBalance = (data: CashJourneyReport): TableTotals => ({
  label: "Saldo inicial",
  labelKey: "ComprobanteDescripcion",
  values: { SaldoAcumulado: money(data.jornada.SaldoInicial) },
});
const totals = (data: CashJourneyReport): TableTotals[] => [
  {
    label: "Totales de movimientos",
    labelKey: "ComprobanteDescripcion",
    values: {
      IngresoEfectivo: money(data.totales.IngresoEfectivo),
      EgresoEfectivo: money(data.totales.EgresoEfectivo),
      OtrosMediosNeto: money(data.totales.OtrosMediosNeto),
      SaldoAcumulado: money(data.totales.SaldoAcumulado),
    },
  },
  ...(data.jornada.Estado === "CERRADO"
    ? [
        {
          label: "Teórico guardado al cierre",
          labelKey: "ComprobanteDescripcion",
          values: { SaldoAcumulado: money(data.jornada.Teorico) },
        },
        {
          label: "Efectivo contado",
          labelKey: "ComprobanteDescripcion",
          values: { SaldoAcumulado: money(data.jornada.SaldoContado) },
        },
        {
          label: "Diferencia de cierre",
          labelKey: "ComprobanteDescripcion",
          values: { SaldoAcumulado: money(data.jornada.Diferencia) },
        },
      ]
    : []),
];
const renderNotes = (data: CashJourneyReport | null) => (
  <div className="report-notes muted small">
    <p>
      Una fila por movimiento válido de la apertura seleccionada, en orden de
      registro y con desempate por identificador interno. Incluye todos sus
      comprobantes, aunque tengan otra fecha de origen. Se excluyen anulados;
      los originales revertidos mantienen su efecto y el reverso pertenece a la
      apertura donde se registró.
    </p>
    <p>
      El saldo acumulado incluye únicamente efectivo. Otros medios es el neto
      informativo de cheques y transferencias: ingreso positivo y egreso
      negativo, sin sumarse al efectivo. No representa saldo bancario
      disponible.
    </p>
    <p>
      Los cierres conservan sus importes guardados. Reemitir consulta la
      información vigente de esa misma apertura, sin modificar el cierre.
    </p>
    {data && (
      <>
        {data.jornada.CierreCoincide === false && (
          <p>
            El teórico calculado con los movimientos vigentes difiere del
            teórico guardado al cierre. Se muestran ambos y se conserva el
            cierre histórico.
          </p>
        )}
        {data.jornada.Observacion && (
          <p>Observación de cierre: {data.jornada.Observacion}</p>
        )}
        <p>
          {data.total} movimientos · Consultado:{" "}
          {displayDateTime(data.consultadoEn)}.
        </p>
      </>
    )}
  </div>
);
/** Pantalla y emisión desde el cierre comparten columnas, importes y notas. */
export const cashJourneyPresentation = {
  title,
  caption: "Movimientos de una jornada real",
  columns,
  rowKey: (r: CashJourneyRow) => r.Clave,
  rowLabel: (r: CashJourneyRow) =>
    `${r.ComprobanteDescripcion} · ${r.NumeroComprobanteTexto}`,
  openingBalance,
  totals,
  renderNotes,
};
export function loadCashJourney(
  openingId: string,
  signal?: AbortSignal,
  box?: string,
) {
  return apiRequest<CashJourneyReport>(
    "/informes/caja/detalle?" +
      new URLSearchParams({
        CajaSaldo: openingId,
        ...(box ? { Caja: box } : {}),
      }),
    signal ? { signal } : undefined,
  );
}
export async function createCashJourneyPdf(openingId: string) {
  const data = await loadCashJourney(openingId);
  if (data.jornada.Clave !== openingId || data.jornada.Estado !== "CERRADO")
    throw new Error(
      "No se obtuvo la jornada cerrada solicitada. Reemití desde Informes.",
    );
  const { createReportPdf } = await import("./report-pdf");
  return createReportPdf(
    buildReportDocument({
      ...cashJourneyPresentation,
      filters: cashJourneySummary(data),
      rows: data.registros,
      openingBalance: openingBalance(data),
      totals: totals(data),
      notes: renderNotes(data),
    }),
  );
}
