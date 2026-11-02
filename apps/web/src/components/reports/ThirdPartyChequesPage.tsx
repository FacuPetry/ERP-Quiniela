import { useState } from "react";
import {
  listSortQuery,
  thirdPartyChequeStates,
  valueStateLabel,
  valueEventLabel,
  type MasterRecord,
  type ThirdPartyChequeRow,
  type ThirdPartyChequeEvent,
  type ThirdPartyChequeReport,
} from "@erp/shared";
import { apiRequest } from "../../services/http";
import { ClientSearch } from "../current-account/ClientSearch";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import { DatePicker, DropDown, TextBox } from "../controls";
import { displayDate, displayDateTime } from "../controls/date-value";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { ActionToolbar } from "../ui/ActionToolbar";
import { initialDateRange } from "../ui/filter-defaults";
import { ReportView, type ReportQuery } from "./ReportView";

const format = amountFormat();
const money = (v: string) => formatAmount(v, format);
const columns: TableColumn<ThirdPartyChequeRow>[] = [
  { key: "Numero", label: "Cheque", sort: "Numero", render: (r) => r.Numero },
  {
    key: "BancoNombre",
    label: "Banco",
    sort: "BancoNombre",
    render: (r) => r.BancoNombre,
  },
  {
    key: "Emision",
    label: "Emisión",
    sort: "Emision",
    render: (r) => displayDate(r.Emision),
  },
  {
    key: "Vencimiento",
    label: "Vencimiento",
    sort: "Vencimiento",
    render: (r) => displayDate(r.Vencimiento),
  },
  {
    key: "ClienteNombre",
    label: "Cliente de origen",
    sort: "ClienteNombre",
    render: (r) => r.ClienteNombre,
  },
  {
    key: "Estado",
    label: "Estado actual",
    sort: "Estado",
    render: (r) => valueStateLabel(r.Estado),
  },
  {
    key: "Importe",
    label: "Importe",
    align: "right",
    sort: "Importe",
    render: (r) => money(r.Importe),
  },
];
const eventColumns: TableColumn<ThirdPartyChequeEvent>[] = [
  { key: "Tipo", label: "Evento", render: (r) => valueEventLabel(r.Tipo) },
  { key: "Fecha", label: "Fecha", render: (r) => displayDate(r.Fecha) },
  { key: "Operacion", label: "Operación", render: (r) => r.Operacion },
  {
    key: "EstadoOperacion",
    label: "Estado de operación",
    render: (r) =>
      r.EstadoOperacion ? valueStateLabel(r.EstadoOperacion) : null,
  },
  {
    key: "CuentaNombre",
    label: "Cuenta bancaria",
    render: (r) => r.CuentaNombre,
  },
  { key: "UsuarioNombre", label: "Usuario", render: (r) => r.UsuarioNombre },
  { key: "Observacion", label: "Observación", render: (r) => r.Observacion },
  {
    key: "SentidoBancario",
    label: "Sentido bancario",
    render: (r) =>
      r.SentidoBancario === "INGRESO"
        ? "Ingreso"
        : r.SentidoBancario === "EGRESO"
          ? "Egreso"
          : null,
  },
  {
    key: "ImporteBancario",
    label: "Importe bancario",
    align: "right",
    render: (r) => (r.ImporteBancario ? money(r.ImporteBancario) : null),
  },
];
interface Filters {
  q: string;
  state: string;
  bank: string;
  client: MasterRecord | null;
  text: string;
  dateBy: "EMISION" | "VENCIMIENTO";
  from: string;
  to: string;
}
async function loadReport({
  filters: f,
  parameters,
  sort,
  signal,
}: ReportQuery<Filters>) {
  return apiRequest<ThirdPartyChequeReport>(
    "/informes/cheques/terceros?" +
      new URLSearchParams({
        ...parameters,
        ...listSortQuery(sort),
        Estado: f.state,
        FechaPor: f.dateBy,
        ...(f.q.trim() ? { q: f.q.trim() } : {}),
        ...(f.bank ? { Banco: f.bank } : {}),
        ...(f.client ? { Cliente: String(f.client.Codigo) } : {}),
        ...(f.from ? { Desde: f.from } : {}),
        ...(f.to ? { Hasta: f.to } : {}),
      }),
    { signal },
  );
}
export function ThirdPartyChequesPage({
  onExpired,
}: {
  onExpired: () => void;
}) {
  const [initialFilters] = useState<Filters>(() => ({
    q: "",
    state: "TODOS",
    bank: "",
    client: null,
    text: "",
    dateBy: "VENCIMIENTO",
    ...initialDateRange(),
  }));
  return (
    <ReportView<ThirdPartyChequeRow, Filters, ThirdPartyChequeReport>
      title="Cheques de terceros"
      caption="Cartera, vencimientos y estados actuales"
      initialFilters={initialFilters}
      load={loadReport}
      onExpired={onExpired}
      columns={columns}
      rowKey={(r) => r.Clave}
      rowLabel={(r) => `${r.BancoNombre} · ${r.Numero}`}
      properties={{
        title: "Propiedades · Cheque de terceros",
        loadRecord: (row, signal) =>
          apiRequest<ThirdPartyChequeRow>(
            "/informes/cheques/terceros/" + encodeURIComponent(row.Clave),
            { signal },
          ),
        fields: [
          ...columns.map((c) => ({
            key: c.key,
            label: c.label,
            render: c.render,
          })),
          { key: "librador", label: "Librador", render: (r) => r.Librador },
          {
            key: "cuenta",
            label: "Cuenta libradora",
            render: (r) => r.CuentaLibradora,
          },
          {
            key: "destino",
            label: "Cuenta de depósito",
            render: (r) => r.CuentaNombre,
          },
          {
            key: "cliente",
            label: "Código de cliente",
            render: (r) => r.Cliente,
          },
          {
            key: "origen",
            label: "Operación de recepción",
            render: (r) => r.Operacion,
          },
          {
            key: "historial",
            label: "Historial vigente",
            render: (r) => (
              <DataTable
                caption="Eventos vigentes del cheque"
                loading={false}
                rows={r.Historial ?? []}
                columns={eventColumns}
                rowKey={(e) => e.Clave}
                showEmptyMessage={false}
                properties={{ title: "Propiedades · Evento de cheque" }}
                toolbar={(actions) => (
                  <div className="master-toolbar">
                    <h3>Eventos</h3>
                    <ActionToolbar
                      labels={{}}
                      busy={false}
                      filtersActive={false}
                      readOnly
                      selected={actions.selected}
                      onProperties={actions.onProperties}
                    />
                  </div>
                )}
              />
            ),
          },
        ],
      }}
      grouping={{
        key: (r) => r.Estado,
        subtotal: (data, state) => {
          const group = data.subtotales.find((s) => s.Estado === state);
          return group
            ? {
                label: `Subtotal · ${valueStateLabel(state)} · ${group.Cantidad}`,
                labelKey: "Numero",
                values: { Importe: money(group.Importe) },
              }
            : undefined;
        },
      }}
      totals={(data) => ({
        label: `Total general · ${data.totales.Cantidad} cheques`,
        labelKey: "Numero",
        values: { Importe: money(data.totales.Importe) },
      })}
      filtersActive={(f) =>
        Boolean(
          f.q || f.bank || f.client || f.state !== "TODOS" || f.from || f.to,
        )
      }
      filterSummary={(f) =>
        `${f.state === "TODOS" ? "Todos los estados vigentes" : valueStateLabel(f.state)} · ${f.bank ? "Banco: " + f.bank : "Todos los bancos"}${f.client ? " · " + String(f.client.Nombre) : ""} · ${f.dateBy === "VENCIMIENTO" ? "Vencimientos" : "Emisiones"}: ${f.from ? displayDate(f.from) : "Desde el inicio"} — ${f.to ? displayDate(f.to) : "Sin fecha final"}${f.q ? " · Búsqueda: " + f.q : ""}`
      }
      validateFilters={(f) =>
        !f.client && f.text.trim()
          ? "Buscá y seleccioná un cliente con la lupa, o limpiá el campo."
          : f.from && f.to && f.from > f.to
            ? "Fecha desde no puede ser posterior a Fecha hasta."
            : undefined
      }
      renderFilters={({ value: v, onChange: set }) => (
        <>
          <TextBox
            id="cheques-report-search"
            label="Búsqueda general"
            value={v.q}
            maxLength={100}
            onValueChange={(q) => set((s) => ({ ...s, q }))}
          />
          <DropDown
            id="cheques-report-state"
            label="Estado actual"
            value={v.state}
            options={[
              { value: "TODOS", label: "Todos" },
              ...thirdPartyChequeStates,
            ]}
            onValueChange={(state) => set((s) => ({ ...s, state }))}
          />
          <ReferenceSelect
            id="cheques-report-bank"
            field={{
              name: "Banco",
              label: "Banco",
              kind: "relation",
              relation: "bancos",
              relationLabelField: "Nombre",
              maxLength: 20,
            }}
            filter
            includeInactive
            value={v.bank}
            onChange={(bank) => set((s) => ({ ...s, bank }))}
            onExpired={onExpired}
          />
          <ClientSearch
            id="cheques-report-client"
            label="Cliente de origen"
            historical
            value={v.client}
            onChange={(client) => set((s) => ({ ...s, client }))}
            onSearchTextChange={(text) => set((s) => ({ ...s, text }))}
            onExpired={onExpired}
          />
          <DropDown
            id="cheques-report-date-by"
            label="Filtrar fechas por"
            value={v.dateBy}
            options={[
              { value: "VENCIMIENTO", label: "Vencimiento" },
              { value: "EMISION", label: "Emisión" },
            ]}
            onValueChange={(dateBy) =>
              set((s) => ({ ...s, dateBy: dateBy as Filters["dateBy"] }))
            }
          />
          <DatePicker
            id="cheques-report-from"
            label="Fecha desde"
            size="sm"
            value={v.from}
            onValueChange={(from) => set((s) => ({ ...s, from }))}
          />
          <DatePicker
            id="cheques-report-to"
            label="Fecha hasta"
            size="sm"
            value={v.to}
            onValueChange={(to) => set((s) => ({ ...s, to }))}
          />
          <p className="muted small">
            Las fechas filtran vencimiento o emisión del instrumento; el estado
            siempre es el actual. Ampliá Fecha hasta para consultar próximos
            vencimientos o vaciá ambas fechas para incluir toda la cartera.
          </p>
        </>
      )}
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Una fila por cheque recibido, agrupado por estado actual. Subtotales
            y total general incluyen todos los cheques que cumplen los filtros.
            Ordenar una columna mantiene los grupos y ordena dentro de cada
            estado.
          </p>
          <p>
            En cartera identifica instrumentos disponibles para operar;
            depositado aún no significa acreditado. El total suma importes
            nominales de los estados consultados: no representa efectivo ni
            saldo bancario disponible. No se incluyen cheques propios ni
            recepciones anuladas.
          </p>
          <p>
            Propiedades muestra eventos vinculados a operaciones vigentes; se
            omiten operaciones anuladas del informe. La trazabilidad completa de
            correcciones se conserva en Valores. Esta consulta no reconstruye
            estados a una fecha de corte.
          </p>
          {data && (
            <p>
              {data.total} cheques · Consultado:{" "}
              {displayDateTime(data.consultadoEn)}.
            </p>
          )}
        </div>
      )}
    />
  );
}
