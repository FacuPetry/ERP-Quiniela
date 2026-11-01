import { useEffect, useState } from "react";
import type { AccountSummary, AccountSummaryRow } from "@erp/shared";
import { apiRequest, ApiRequestError } from "../../services/http";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { ActionToolbar } from "../ui/ActionToolbar";
import { Pagination } from "../ui/Pagination";
import { useListSorting } from "../ui/useListSorting";
import { TextBox } from "../controls";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { displayDateTime } from "../controls/date-value";
import { Icon } from "../Icon";
import "./reports.css";
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
    label: "Saldo por cobrar",
    sort: "SaldoCobrar",
    render: (r) => money(r.SaldoCobrar),
  },
  {
    key: "SaldoPagar",
    label: "Saldo por pagar",
    sort: "SaldoPagar",
    render: (r) => money(r.SaldoPagar),
  },
  {
    key: "SaldoNeto",
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
export function AccountSummaryPage({ onExpired }: { onExpired: () => void }) {
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [requested, setRequested] = useState(false),
    [data, setData] = useState<AccountSummary | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const sorting = useListSorting(setPage);
  useEffect(() => {
    if (!requested) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setSelected(null);
    const params = new URLSearchParams({
      ...sorting.query,
      q: query,
      pagina: String(page),
    });
    void apiRequest<AccountSummary>("/informes/cuenta-corriente?" + params, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setError(e instanceof Error ? e.message : "No se pudo consultar.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [requested, query, page, revision, sorting.value, onExpired]);
  function consult() {
    setPage(1);
    setQuery(draft.trim());
    setRequested(true);
    setRevision((v) => v + 1);
  }
  return (
    <div className="account-report">
      <section className="panel report-introduction">
        <span className="section-icon">
          <Icon name="account" />
        </span>
        <div>
          <h2>Resumen de Cuenta corriente</h2>
          <p className="muted small">
            Saldos actuales de apuestas y premios, con cobros, pagos y
            correcciones registrados.
          </p>
        </div>
        <span className="badge">Saldo actual</span>
      </section>
      <form
        className="panel report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          consult();
        }}
      >
        <TextBox
          id="report-client"
          label="Cliente"
          type="search"
          value={draft}
          onValueChange={setDraft}
          placeholder="Código o nombre del cliente"
          size="lg"
          maxLength={100}
        />
        <button type="submit" className="button primary" disabled={loading}>
          <Icon name="search" size={17} />
          Consultar
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={loading}
          onClick={() => setDraft("")}
        >
          Limpiar
        </button>
        <p className="muted small">
          Sin criterio de cliente, se consultan todos los que tienen movimientos
          confirmados. Incluye movimientos de cualquier fecha.
        </p>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="report-totals" aria-busy={loading}>
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
      <section className="panel master-panel">
        <DataTable
          caption="Resumen por cliente"
          rows={data?.registros ?? []}
          columns={columns}
          loading={loading}
          rowKey={(r) => r.Cliente}
          rowLabel={(r) => r.Cliente + " - " + r.ClienteNombre}
          selectedKey={selected}
          onSelectionChange={setSelected}
          sort={sorting.value}
          onSortChange={sorting.onChange}
          emptyMessage={
            requested
              ? "No hay registros para mostrar."
              : "Presioná Consultar o Actualizar listado para ver los saldos."
          }
          properties={{
            title: "Propiedades · Resumen de Cuenta corriente",
            fields: extraFields,
            onExpired,
          }}
          toolbar={(actions) => (
            <div className="master-toolbar">
              <h2>Saldos por cliente</h2>
              <ActionToolbar
                labels={{}}
                busy={false}
                refreshing={loading}
                readOnly
                selected={actions.selected}
                filtersActive={Boolean(query)}
                onProperties={actions.onProperties}
                onRefresh={() => {
                  setRequested(true);
                  setRevision((v) => v + 1);
                }}
              />
            </div>
          )}
        />
        {data && (
          <Pagination
            page={data.pagina}
            limit={data.limite}
            total={data.total}
            loading={loading}
            onChange={setPage}
          />
        )}
      </section>
      <div className="report-notes muted small">
        <p>
          Totales de todos los clientes que cumplen la búsqueda, no solo de la
          página visible.{" "}
          {data && <>Consultado: {displayDateTime(data.consultadoEn)}.</>}
        </p>
        <p>
          Un saldo negativo en una cuenta representa un importe a favor. El neto
          es informativo y no compensa automáticamente apuestas con premios. Los
          anticipos y créditos sin aplicar ya reducen el saldo; el pendiente
          documental se puede consultar en Propiedades.
        </p>
        <p>
          Este informe muestra la situación actual; no reconstruye saldos
          históricos a una fecha de corte.
        </p>
      </div>
    </div>
  );
}
