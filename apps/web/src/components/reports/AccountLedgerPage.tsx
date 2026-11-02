import { valueStateLabel } from "@erp/shared";
import type {
  AccountLedger,
  AccountLedgerRow,
  MasterRecord,
} from "@erp/shared";
import { apiRequest } from "../../services/http";
import { ClientSearch } from "../current-account/ClientSearch";
import type { TableColumn } from "../ui/DataTable";
import { displayDate, displayDateTime } from "../controls/date-value";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { ReportView, type ReportQuery } from "./ReportView";
const config = amountFormat();
const money = (v: string) => formatAmount(v, config);
const state = (r: AccountLedgerRow) =>
  r.Estado === "ANULADO"
    ? "Anulado"
    : r.Estado === "REVERTIDO"
      ? "Revertido"
      : r.EsReverso
        ? "Confirmado · Reversión"
        : "Confirmado";
const account = (r: AccountLedgerRow) =>
  r.Cuenta === "COBRAR" ? "Cobrar" : "Pagar";
const columns: TableColumn<AccountLedgerRow>[] = [
  {
    key: "FechaOrigen",
    label: "Fecha de origen",
    render: (r) => displayDate(r.FechaOrigen),
  },
  {
    key: "ComprobanteDescripcion",
    label: "Comprobante",
    render: (r) => r.ComprobanteDescripcion,
  },
  {
    key: "NumeroComprobanteTexto",
    label: "Número de comprobante",
    render: (r) => r.NumeroComprobanteTexto,
  },
  { key: "Cuenta", label: "Cuenta", render: account },
  {
    key: "Detalle",
    label: "Concepto o detalle",
    render: (r) => (
      <span className="report-ledger-details" title={r.Detalle}>
        {r.Detalle}
      </span>
    ),
  },
  { key: "Estado", label: "Estado", render: state },
  {
    key: "Debito",
    label: "Débito",
    align: "right",
    render: (r) => money(r.Debito),
  },
  {
    key: "Credito",
    label: "Crédito",
    align: "right",
    render: (r) => money(r.Credito),
  },
  {
    key: "SaldoAcumulado",
    label: "Saldo acumulado",
    align: "right",
    render: (r) => <strong>{money(r.SaldoAcumulado)}</strong>,
  },
];
const fields = [
  ...columns.map((c) => ({ key: c.key, label: c.label, render: c.render })),
  {
    key: "Naturaleza",
    label: "Naturaleza registrada",
    render: (r: AccountLedgerRow) =>
      r.Naturaleza === "DEUDA" ? "Deuda" : "Crédito",
  },
  {
    key: "ImporteOriginal",
    label: "Importe original",
    render: (r: AccountLedgerRow) => money(r.ImporteOriginal),
  },
  {
    key: "SaldoCobrar",
    label: "Saldo por cobrar acumulado",
    render: (r: AccountLedgerRow) => money(r.SaldoCobrar),
  },
  {
    key: "SaldoPagar",
    label: "Saldo por pagar acumulado",
    render: (r: AccountLedgerRow) => money(r.SaldoPagar),
  },
  {
    key: "Operacion",
    label: "Operación relacionada",
    render: (r: AccountLedgerRow) => r.Operacion,
  },
  {
    key: "Original",
    label: "Movimiento original",
    render: (r: AccountLedgerRow) => r.Original,
  },
  {
    key: "Reversion",
    label: "Contrapartida de reversión",
    render: (r: AccountLedgerRow) => r.Reversion,
  },
  {
    key: "AnuladoEn",
    label: "Anulado el",
    render: (r: AccountLedgerRow) =>
      r.AnuladoEn ? displayDateTime(r.AnuladoEn) : null,
  },
  {
    key: "MotivoAnulacion",
    label: "Motivo de anulación",
    render: (r: AccountLedgerRow) => r.MotivoAnulacion,
  },
  {
    key: "Afectaciones",
    label: "Afectaciones relacionadas (informativas)",
    render: (r: AccountLedgerRow) =>
      r.Afectaciones.length
        ? r.Afectaciones.map(
            (a) =>
              `${displayDate(a.Fecha)} · ${a.Operacion} → ${a.Documento}: ${money(a.Importe)} · ${a.Vigente ? "Aplicación vigente" : "Sin efecto por anulación"}${a.Estado === "REVERTIDO" ? " (original con contrapartida)" : ""}`,
          ).join("\n")
        : "Sin afectaciones relacionadas",
  },
  {
    key: "Valores",
    label: "Valores de las operaciones relacionadas (informativos)",
    render: (r: AccountLedgerRow) =>
      r.Valores.length
        ? r.Valores.map(
            (v) =>
              `${v.Operacion} · ${v.Tipo === "TRANSFERENCIA" ? "Transferencia" : v.Tipo === "PROPIO" ? "Cheque propio" : "Cheque de terceros"} ${v.Numero} · ${v.CuentaNombre ?? v.BancoNombre} · ${money(v.Importe)} · ${valueStateLabel(v.Estado)}`,
          ).join("\n")
        : "Sin cheques ni transferencias relacionados",
  },
];
interface Filters {
  client: MasterRecord | null;
  text: string;
}
const initialFilters: Filters = { client: null, text: "" };
async function loadLedger({ filters, page, signal }: ReportQuery<Filters>) {
  if (!filters.client) throw new Error("Seleccioná un cliente con la lupa.");
  return apiRequest<AccountLedger>(
    "/informes/cuenta-corriente/resumen?" +
      new URLSearchParams({
        Cliente: String(filters.client.Codigo),
        pagina: String(page),
      }),
    { signal },
  );
}
export function AccountLedgerPage({ onExpired }: { onExpired: () => void }) {
  return (
    <ReportView<AccountLedgerRow, Filters, AccountLedger>
      title="Resumen de Cuenta corriente"
      description="Movimientos del cliente y saldo vigente acumulado, en orden cronológico."
      caption="Mayor de Cuenta corriente"
      icon="account"
      badge="Saldo vigente"
      initialFilters={initialFilters}
      load={loadLedger}
      onExpired={onExpired}
      columns={columns}
      rowKey={(r) => r.Clave}
      rowLabel={(r) =>
        r.ComprobanteDescripcion + " " + r.NumeroComprobanteTexto
      }
      properties={{ title: "Propiedades · Movimiento del mayor", fields }}
      filtersActive={(f) => Boolean(f.client)}
      filterSummary={(f) =>
        f.client
          ? `${String(f.client.Codigo)} - ${String(f.client.Nombre)}`
          : "Seleccioná un cliente."
      }
      validateFilters={(f) =>
        !f.client
          ? "Seleccioná un cliente válido mediante la lupa para consultar el resumen."
          : undefined
      }
      renderFilters={({ value, onChange }) => (
        <ClientSearch
          id="ledger-client"
          label="Cliente"
          required
          historical
          size="lg"
          value={value.client}
          onChange={(client) => onChange((current) => ({ ...current, client }))}
          onSearchTextChange={(text) =>
            onChange((current) => ({ ...current, text }))
          }
          onExpired={onExpired}
        />
      )}
      totals={(data) => ({
        label: "Totales del cliente",
        labelSpan: 6,
        values: {
          Debito: money(data.totales.Debito),
          Credito: money(data.totales.Credito),
          SaldoAcumulado: money(data.totales.SaldoFinal),
        },
      })}
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Débito aumenta el neto a cobrar; Crédito lo disminuye. Apuestas y
            pagos suman Débito; premios y cobros suman Crédito. La cuenta y su
            naturaleza original se conservan.
          </p>
          <p>
            Los anulados se muestran sin incidencia y conservan su importe
            original en Propiedades. Los originales revertidos conservan su
            efecto junto con la contrapartida. Es un mayor del saldo vigente, no
            una reconstrucción histórica a fecha de corte.
          </p>
          <p>
            Afectaciones y valores se consultan desde Propiedades y no vuelven a
            sumarse. Los importes de los valores corresponden al medio completo
            de su operación, no a una porción de cada afectación.
          </p>
          {data && (
            <p>
              Totales de todos los movimientos del cliente, no solo de la página
              visible. Saldo por cobrar: {money(data.totales.SaldoCobrar)} ·
              Saldo por pagar: {money(data.totales.SaldoPagar)}. Consultado:{" "}
              {displayDateTime(data.consultadoEn)}.
            </p>
          )}
        </div>
      )}
    />
  );
}
