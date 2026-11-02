import { valueStateLabel } from "@erp/shared";
import type {
  AccountLedger,
  AccountLedgerRow,
  MasterRecord,
} from "@erp/shared";
import { apiRequest } from "../../services/http";
import { ClientSearch } from "../current-account/ClientSearch";
import type { TableColumn } from "../ui/DataTable";
import { DatePicker } from "../controls/DatePicker";
import { useState } from "react";
import { todayISO, displayDate, displayDateTime } from "../controls/date-value";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { ReportView, type ReportQuery } from "./ReportView";
const config = amountFormat();
const money = (v: string) => formatAmount(v, config);
// Solo decide visibilidad sobre el decimal exacto recibido; no modifica importes.
const hasBalance = (value: string) => /[1-9]/.test(value);
const hasReportContent = (data: AccountLedger) =>
  data.registros.length > 0 ||
  [
    data.saldoAnterior.Saldo,
    data.saldoAVencer.Saldo,
    data.totales.Debito,
    data.totales.Credito,
    data.totales.SaldoFinal,
  ].some(hasBalance);
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
  from: string;
  to: string;
}
async function loadLedger({
  filters,
  parameters,
  signal,
}: ReportQuery<Filters>) {
  if (!filters.client) throw new Error("Seleccioná un cliente con la lupa.");
  return apiRequest<AccountLedger>(
    "/informes/cuenta-corriente/resumen?" +
      new URLSearchParams({
        Cliente: String(filters.client.Codigo),
        ...parameters,
        ...(filters.from ? { Desde: filters.from } : {}),
        ...(filters.to ? { Hasta: filters.to } : {}),
      }),
    { signal },
  );
}
export function AccountLedgerPage({ onExpired }: { onExpired: () => void }) {
  const [initialFilters] = useState<Filters>(() => {
    const to = todayISO();
    // Restar días civiles en UTC a la fecha del negocio evita cambios por horario.
    const from = new Date(to + "T00:00:00Z");
    from.setUTCDate(from.getUTCDate() - 30);
    return {
      client: null,
      text: "",
      from: from.toISOString().slice(0, 10),
      to,
    };
  });
  return (
    <ReportView<AccountLedgerRow, Filters, AccountLedger>
      title="Resumen de Cuenta corriente"
      caption="Mayor de Cuenta corriente"
      initialFilters={initialFilters}
      load={loadLedger}
      onExpired={onExpired}
      columns={columns}
      showEmptyMessage={false}
      rowKey={(r) => r.Clave}
      rowLabel={(r) =>
        r.ComprobanteDescripcion + " " + r.NumeroComprobanteTexto
      }
      properties={{ title: "Propiedades · Movimiento del mayor", fields }}
      filtersActive={(f) => Boolean(f.client || f.from || f.to)}
      filterSummary={(f) =>
        f.client
          ? `${String(f.client.Codigo)} - ${String(f.client.Nombre)} · ${f.from ? displayDate(f.from) : "Desde el inicio"} — ${f.to ? displayDate(f.to) : "Sin fecha final"}`
          : "Seleccioná un cliente."
      }
      validateFilters={(f) =>
        !f.client
          ? "Seleccioná un cliente válido mediante la lupa para consultar el resumen."
          : f.from && f.to && f.from > f.to
            ? "Fecha desde no puede ser posterior a Fecha hasta."
            : undefined
      }
      renderFilters={({ value, onChange }) => (
        <>
          <ClientSearch
            id="ledger-client"
            label="Cliente"
            required
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
          <DatePicker
            id="ledger-from"
            label="Fecha desde"
            size="sm"
            value={value.from}
            onValueChange={(from) =>
              onChange((current) => ({ ...current, from }))
            }
          />
          <DatePicker
            id="ledger-to"
            label="Fecha hasta"
            size="sm"
            value={value.to}
            onValueChange={(to) => onChange((current) => ({ ...current, to }))}
          />
        </>
      )}
      openingBalance={(data) =>
        hasBalance(data.saldoAnterior.Saldo)
          ? {
              label: "Saldo anterior",
              labelKey: "ComprobanteDescripcion",
              values: {
                Debito: money(data.saldoAnterior.Debito),
                Credito: money(data.saldoAnterior.Credito),
                SaldoAcumulado: money(data.saldoAnterior.Saldo),
              },
            }
          : undefined
      }
      closingBalance={(data) =>
        hasBalance(data.saldoAVencer.Saldo)
          ? {
              label: "Saldo a vencer",
              labelKey: "ComprobanteDescripcion",
              values: {
                Debito: money(data.saldoAVencer.Debito),
                Credito: money(data.saldoAVencer.Credito),
                SaldoAcumulado: money(data.saldoAVencer.SaldoAcumulado),
              },
            }
          : undefined
      }
      totals={(data) =>
        hasReportContent(data)
          ? {
              label: "Totales del período",
              labelKey: "ComprobanteDescripcion",
              values: {
                Debito: money(data.totales.Debito),
                Credito: money(data.totales.Credito),
                SaldoAcumulado: money(data.totales.SaldoFinal),
              },
            }
          : undefined
      }
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Débito aumenta el neto a cobrar; Crédito lo disminuye. Apuestas y
            pagos suman Débito; premios y cobros suman Crédito. La cuenta y su
            naturaleza original se conservan.
          </p>
          <p>
            Se excluyen los anulados. Los originales revertidos conservan su
            efecto junto con la contrapartida, cada uno en su fecha de origen.
            El saldo anterior incluye los movimientos previos a Fecha desde; los
            totales de Débito y Crédito corresponden solo al período.
          </p>
          <p>
            La consulta utiliza los estados vigentes hoy; no reconstruye el
            estado que tenían las operaciones antes de una anulación posterior.
            «Saldo a vencer» agrupa movimientos con fecha de origen posterior a
            Fecha hasta; no utiliza la fecha de vencimiento ni representa el
            pendiente documental. Su saldo acumulado continúa el cierre con esos
            movimientos.
          </p>
          <p>
            Afectaciones y valores se consultan desde Propiedades y no vuelven a
            sumarse. Los importes de los valores corresponden al medio completo
            de su operación, no a una porción de cada afectación.
          </p>
          {data && (
            <p>
              Saldo al cierre del período: saldo anterior + débitos − créditos.
              Saldo por cobrar al cierre: {money(data.totales.SaldoCobrar)} ·
              Saldo por pagar al cierre: {money(data.totales.SaldoPagar)}.
              Consultado: {displayDateTime(data.consultadoEn)}.
            </p>
          )}
        </div>
      )}
    />
  );
}
