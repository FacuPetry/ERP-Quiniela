import {
  listSortQuery,
  type AccountSummary,
  type AccountSummaryRow,
  type MasterRecord,
} from "@erp/shared";
import { apiRequest } from "../../services/http";
import type { TableColumn } from "../ui/DataTable";
import { ClientSearch } from "../current-account/ClientSearch";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { displayDateTime } from "../controls/date-value";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import { ReportView, type ReportQuery } from "./ReportView";
const format = amountFormat();
const money = (v: string) => formatAmount(v, format);
const columns: TableColumn<AccountSummaryRow>[] = [
  {
    key: "Cliente",
    label: "Código",
    sort: "Cliente",
    render: (r) => r.Cliente,
  },
  {
    key: "ClienteNombre",
    label: "Cliente",
    sort: "ClienteNombre",
    render: (r) => r.ClienteNombre,
  },
  {
    key: "SaldoCobrar",
    align: "right",
    label: "Saldo por cobrar",
    sort: "SaldoCobrar",
    render: (r) => money(r.SaldoCobrar),
  },
  {
    key: "SaldoPagar",
    align: "right",
    label: "Saldo por pagar",
    sort: "SaldoPagar",
    render: (r) => money(r.SaldoPagar),
  },
  {
    key: "SaldoNeto",
    align: "right",
    label: "Saldo neto",
    sort: "SaldoNeto",
    render: (r) => money(r.SaldoNeto),
  },
];
const extraFields = [
  ...columns.map((c) => ({ key: c.key, label: c.label, render: c.render })),
  {
    key: "PendienteCobrar",
    label: "Pendiente documental de cobro",
    render: (r: AccountSummaryRow) => money(r.PendienteCobrar),
  },
  {
    key: "PendientePagar",
    label: "Pendiente documental de pago",
    render: (r: AccountSummaryRow) => money(r.PendientePagar),
  },
  {
    key: "CreditoSinAplicarCobrar",
    label: "Créditos sin aplicar de Cobrar",
    render: (r: AccountSummaryRow) => money(r.CreditoSinAplicarCobrar),
  },
  {
    key: "CreditoSinAplicarPagar",
    label: "Créditos sin aplicar de Pagar",
    render: (r: AccountSummaryRow) => money(r.CreditoSinAplicarPagar),
  },
];
interface SummaryFilters {
  client: MasterRecord | null;
  text: string;
  clientType: string;
}
const initialFilters: SummaryFilters = {
  client: null,
  text: "",
  clientType: "",
};
async function loadSummary({
  filters,
  parameters,
  sort,
  signal,
}: ReportQuery<SummaryFilters>) {
  const params = new URLSearchParams({
    ...listSortQuery(sort),
    ...parameters,
    ...(filters.clientType ? { ClienteTipo: filters.clientType } : {}),
    ...(filters.client ? { Cliente: String(filters.client.Codigo) } : {}),
  });
  return apiRequest<AccountSummary>("/informes/cuenta-corriente?" + params, {
    signal,
  });
}
export function AccountSummaryPage({ onExpired }: { onExpired: () => void }) {
  return (
    <ReportView<AccountSummaryRow, SummaryFilters, AccountSummary>
      title="Listado de Cuenta corriente"
      caption="Saldos por cliente"
      initialFilters={initialFilters}
      load={loadSummary}
      onExpired={onExpired}
      columns={columns}
      rowKey={(r) => r.Cliente}
      rowLabel={(r) => r.Cliente + " - " + r.ClienteNombre}
      properties={{
        title: "Propiedades · Listado de Cuenta corriente",
        fields: extraFields,
      }}
      filtersActive={(f) => Boolean(f.client || f.clientType)}
      filterSummary={(f) =>
        f.client
          ? `Cliente: ${String(f.client.Codigo)} - ${String(f.client.Nombre)}`
          : f.clientType
            ? `Tipo de cliente: ${f.clientType}`
            : "Todos los clientes con movimientos confirmados."
      }
      validateFilters={(f) =>
        !f.client && f.text.trim()
          ? "Buscá y seleccioná un cliente con la lupa, o limpiá el campo para consultar todos."
          : undefined
      }
      renderFilters={({ value, onChange }) => (
        <>
          <ReferenceSelect
            field={{
              name: "ClienteTipo",
              label: "Tipo de cliente",
              kind: "relation",
              maxLength: 20,
              relation: "tipos-cliente",
              relationLabelField: "Descripcion",
            }}
            id="listing-client-type"
            value={value.clientType}
            filter
            includeInactive
            onChange={(clientType) =>
              onChange(() => ({ clientType, client: null, text: "" }))
            }
            onExpired={onExpired}
          />
          <ClientSearch
            key={value.clientType}
            id="report-client"
            label="Cliente"
            historical
            size="lg"
            clientType={value.clientType}
            value={value.client}
            onChange={(client) =>
              onChange((current) => ({ ...current, client }))
            }
            onSearchTextChange={(text) =>
              onChange((current) => ({ ...current, text }))
            }
            onExpired={onExpired}
          />
          <p className="muted small">
            Tipo y Cliente son opcionales. El SF busca dentro del tipo elegido;
            cambiar el tipo limpia la selección de cliente.
          </p>
        </>
      )}
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Saldos actuales de los clientes que cumplen los filtros.{" "}
            {data && <>Consultado: {displayDateTime(data.consultadoEn)}.</>}
          </p>
          <p>
            Un saldo negativo en una cuenta representa un importe a favor. El
            neto es informativo y no compensa automáticamente apuestas con
            premios. Los anticipos y créditos sin aplicar ya reducen el saldo;
            el pendiente documental se puede consultar en Propiedades.
          </p>
          <p>
            Este informe muestra la situación actual; no reconstruye saldos
            históricos a una fecha de corte.
          </p>
        </div>
      )}
    />
  );
}
