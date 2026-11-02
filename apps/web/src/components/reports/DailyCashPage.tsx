import { useState } from "react";
import {
  listSortQuery,
  type DailyCashReport,
  type DailyCashRow,
} from "@erp/shared";
import { apiRequest } from "../../services/http";
import { DatePicker } from "../controls/DatePicker";
import { DropDown } from "../controls/DropDown";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { displayDate, displayDateTime } from "../controls/date-value";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import type { TableColumn } from "../ui/DataTable";
import type { PropertyField } from "../ui/RecordProperties";
import { initialDateRange } from "../ui/filter-defaults";
import { ReportView, type ReportQuery } from "./ReportView";

const format = amountFormat();
const money = (v: string | null) => (v == null ? "—" : formatAmount(v, format));
const columns: TableColumn<DailyCashRow>[] = [
  {
    key: "CajaNombre",
    label: "Caja",
    sort: "CajaNombre",
    render: (r) => r.CajaNombre,
  },
  {
    key: "AperturaEn",
    label: "Apertura",
    sort: "AperturaEn",
    render: (r) => displayDateTime(r.AperturaEn),
  },
  {
    key: "CierreEn",
    label: "Cierre",
    sort: "CierreEn",
    render: (r) => (r.CierreEn ? displayDateTime(r.CierreEn) : "—"),
  },
  {
    key: "Estado",
    label: "Estado",
    sort: "Estado",
    render: (r) => (r.Estado === "ABIERTO" ? "Abierta" : "Cerrada"),
  },
  ...(
    [
      ["SaldoInicial", "Saldo inicial"],
      ["IngresosEfectivo", "Ingresos de efectivo"],
      ["EgresosEfectivo", "Egresos de efectivo"],
      ["Teorico", "Efectivo teórico"],
      ["SaldoContado", "Efectivo contado"],
      ["Diferencia", "Diferencia"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    align: "right" as const,
    sort: key,
    render: (r: DailyCashRow) => money(r[key]),
  })),
];
const fields: PropertyField<DailyCashRow>[] = [
  ...columns.map((c) => ({ key: c.key, label: c.label, render: c.render })),
  { key: "Caja", label: "Código de caja", render: (r) => r.Caja },
  {
    key: "UsuarioAperturaNombre",
    label: "Responsable de apertura",
    render: (r) => r.UsuarioAperturaNombre,
  },
  {
    key: "UsuarioCierreNombre",
    label: "Responsable de cierre",
    render: (r) => r.UsuarioCierreNombre,
  },
  ...(
    [
      ["IngresosComerciales", "Cobros/pagos: efectivo ingresado"],
      ["EgresosComerciales", "Cobros/pagos: efectivo entregado"],
      ["IngresosTesoreria", "Tesorería: efectivo ingresado"],
      ["EgresosTesoreria", "Tesorería: efectivo retirado"],
      ["IngresosOtrosMedios", "Otros medios ingresados (informativo)"],
      ["EgresosOtrosMedios", "Otros medios entregados (informativo)"],
      ["TeoricoCalculado", "Teórico según movimientos registrados"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    render: (r: DailyCashRow) => money(r[key]),
  })),
  {
    key: "CierreCoincide",
    label: "Control del cierre guardado",
    render: (r) =>
      r.Estado === "ABIERTO"
        ? "Jornada abierta"
        : r.CierreCoincide == null
          ? "Sin importe teórico guardado"
          : r.CierreCoincide
            ? "Coincide con los movimientos"
            : "No coincide con los movimientos; se conserva el cierre guardado",
  },
  {
    key: "Movimientos",
    label: "Movimientos vigentes",
    render: (r) => r.Movimientos,
  },
  {
    key: "Observacion",
    label: "Observación del cierre",
    render: (r) => r.Observacion,
  },
];
interface Filters {
  caja: string;
  estado: "TODOS" | "ABIERTO" | "CERRADO";
  from: string;
  to: string;
}
async function loadReport({
  filters,
  parameters,
  sort,
  signal,
}: ReportQuery<Filters>) {
  return apiRequest<DailyCashReport>(
    "/informes/caja/diario?" +
      new URLSearchParams({
        ...parameters,
        ...listSortQuery(sort),
        Estado: filters.estado,
        ...(filters.caja ? { Caja: filters.caja } : {}),
        ...(filters.from ? { Desde: filters.from } : {}),
        ...(filters.to ? { Hasta: filters.to } : {}),
      }),
    { signal },
  );
}
export function DailyCashPage({ onExpired }: { onExpired: () => void }) {
  const [initialFilters] = useState<Filters>(() => ({
    caja: "",
    estado: "TODOS",
    ...initialDateRange(),
  }));
  return (
    <ReportView<DailyCashRow, Filters, DailyCashReport>
      title="Resumen diario de caja"
      caption="Jornadas de caja"
      initialFilters={initialFilters}
      load={loadReport}
      onExpired={onExpired}
      columns={columns}
      rowKey={(r) => r.Clave}
      rowLabel={(r) => `${r.CajaNombre} · ${displayDateTime(r.AperturaEn)}`}
      properties={{ title: "Propiedades · Jornada de caja", fields }}
      grouping={{
        key: (row) => row.Caja,
        subtotal: (data, key) => {
          const group = data.subtotales.find((g) => g.Caja === key);
          return group
            ? {
                label: `Subtotal · ${group.CajaNombre}`,
                labelKey: "CajaNombre",
                values: {
                  IngresosEfectivo: money(group.IngresosEfectivo),
                  EgresosEfectivo: money(group.EgresosEfectivo),
                  Diferencia: money(group.Diferencia),
                },
              }
            : undefined;
        },
      }}
      filtersActive={(f) =>
        Boolean(f.caja || f.estado !== "TODOS" || f.from || f.to)
      }
      filterSummary={(f) =>
        `${f.caja ? "Caja: " + f.caja : "Todas las cajas"} · ${f.estado === "TODOS" ? "Todas las jornadas" : f.estado === "ABIERTO" ? "Abiertas" : "Cerradas"} · Aperturas: ${f.from ? displayDate(f.from) : "Desde el inicio"} — ${f.to ? displayDate(f.to) : "Sin fecha final"}`
      }
      validateFilters={(f) =>
        f.from && f.to && f.from > f.to
          ? "Fecha desde no puede ser posterior a Fecha hasta."
          : undefined
      }
      renderFilters={({ value, onChange }) => (
        <>
          <ReferenceSelect
            field={{
              name: "Caja",
              label: "Caja",
              kind: "relation",
              relation: "cajas",
              relationLabelField: "Nombre",
              maxLength: 20,
            }}
            id="cash-report-box"
            filter
            includeInactive
            value={value.caja}
            onChange={(caja) => onChange((current) => ({ ...current, caja }))}
            onExpired={onExpired}
          />
          <DropDown
            id="cash-report-state"
            label="Estado de jornada"
            value={value.estado}
            onValueChange={(estado) =>
              onChange((current) => ({
                ...current,
                estado: estado as Filters["estado"],
              }))
            }
            options={[
              { value: "TODOS", label: "Todos" },
              { value: "ABIERTO", label: "Abierta" },
              { value: "CERRADO", label: "Cerrada" },
            ]}
          />
          <DatePicker
            id="cash-report-from"
            label="Fecha de apertura desde"
            size="sm"
            value={value.from}
            onValueChange={(from) =>
              onChange((current) => ({ ...current, from }))
            }
          />
          <DatePicker
            id="cash-report-to"
            label="Fecha de apertura hasta"
            size="sm"
            value={value.to}
            onValueChange={(to) => onChange((current) => ({ ...current, to }))}
          />
          <p className="muted small">
            Las fechas filtran la apertura de la jornada. Cada fila incluye
            todos sus movimientos, aunque tengan otra fecha de origen. Se pueden
            consultar cajas inactivas con historia.
          </p>
        </>
      )}
      totals={(data) => ({
        label: "Total general",
        labelKey: "CajaNombre",
        values: {
          IngresosEfectivo: money(data.totales.IngresosEfectivo),
          EgresosEfectivo: money(data.totales.EgresosEfectivo),
          Diferencia: money(data.totales.Diferencia),
        },
      })}
      renderNotes={(data) => (
        <div className="report-notes muted small">
          <p>
            Una fila por jornada real de caja, agrupada por Caja con su
            subtotal. Ordenar una columna mantiene los grupos y ordena dentro de
            cada caja. El efectivo teórico es saldo inicial + ingresos − egresos
            de efectivo. Transferencias y cheques no aumentan el efectivo
            físico; sus importes se consultan en Propiedades.
          </p>
          <p>
            Se excluyen los anulados. Un original revertido conserva su efecto
            en su jornada y el reverso se refleja en la jornada donde fue
            registrado. Los cierres muestran el teórico y contado guardados; una
            jornada abierta todavía no tiene contado ni diferencia.
          </p>
          <p>
            Los totales abarcan todas las jornadas que cumplen los filtros. Se
            suman flujos y diferencias de cierres completos; no se suman saldos
            iniciales, teóricos o contados de jornadas sucesivas. Si un cierre
            carece de importes guardados, su diferencia y el total de
            diferencias quedan sin informar.
          </p>
          {data && (
            <p>
              {data.total} jornadas · {data.totales.Abiertas} abiertas ·{" "}
              {data.totales.Cerradas} cerradas · {data.totales.Movimientos}{" "}
              movimientos vigentes. Consultado:{" "}
              {displayDateTime(data.consultadoEn)}.
            </p>
          )}
        </div>
      )}
    />
  );
}
