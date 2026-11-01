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
import { Icon } from "../Icon";
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
    render: (r) => <strong>{money(r.SaldoNeto)}</strong>,
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
}
const initialFilters: SummaryFilters = { client: null, text: "" };
async function loadSummary({
  filters,
  page,
  sort,
  signal,
}: ReportQuery<SummaryFilters>) {
  const params = new URLSearchParams({
    ...listSortQuery(sort),
    pagina: String(page),
    ...(filters.client ? { Cliente: String(filters.client.Codigo) } : {}),
  });
  return apiRequest<AccountSummary>("/informes/cuenta-corriente?" + params, {
    signal,
  });
}
export function AccountSummaryPage({ onExpired }: { onExpired: () => void }) {
  return (
    <ReportView<AccountSummaryRow, SummaryFilters, AccountSummary>
      title="Resumen de Cuenta corriente"
      description="Saldos actuales de apuestas y premios, con cobros, pagos y correcciones registrados."
      caption="Saldos por cliente"
      icon="account"
      badge="Saldo actual"
      initialFilters={initialFilters}
      load={loadSummary}
      onExpired={onExpired}
      columns={columns}
      rowKey={(r) => r.Cliente}
      rowLabel={(r) => r.Cliente + " - " + r.ClienteNombre}
      properties={{
        title: "Propiedades · Resumen de Cuenta corriente",
        fields: extraFields,
      }}
      filtersActive={(f) => Boolean(f.client)}
      filterSummary={(f) =>
        f.client
          ? `Cliente: ${String(f.client.Codigo)} - ${String(f.client.Nombre)}`
          : "Todos los clientes con movimientos confirmados."
      }
      validateFilters={(f) =>
        !f.client && f.text.trim()
          ? "Buscá y seleccioná un cliente con la lupa, o limpiá el campo para consultar todos."
          : undefined
      }
      renderFilters={({ value, onChange }) => (
        <>
          <ClientSearch
            id="report-client"
            label="Cliente"
            historical
            size="lg"
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
            Sin cliente seleccionado se consultan todos los que tienen
            movimientos confirmados. Incluye movimientos de cualquier fecha.
          </p>
        </>
      )}
      renderSummary={(data) => (
        <div className="report-totals">
          {(
            [
              {
                key: "SaldoCobrar",
                title: "Saldo por cobrar",
                note: "Cuenta de apuestas",
                icon: "account",
              },
              {
                key: "SaldoPagar",
                title: "Saldo por pagar",
                note: "Cuenta de premios",
                icon: "wallet",
              },
              {
                key: "SaldoNeto",
                title: "Saldo neto",
                note: "Cobrar menos Pagar",
                icon: "exchange",
              },
            ] as const
          ).map((card) => (
            <section
              key={card.key}
              className={
                "panel report-total " +
                (card.key === "SaldoNeto" ? "report-total-net" : "")
              }
            >
              <Icon name={card.icon} />
              <h2>{card.title}</h2>
              <p className="report-number">
                {data ? money(data.totales[card.key]) : "—"}
              </p>
              <p className="small muted">{card.note}</p>
            </section>
          ))}
        </div>
      )}
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Totales de todos los clientes que cumplen la búsqueda, no solo de la
            página visible.{" "}
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
