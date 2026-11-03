import { useEffect, useState } from "react";
import type {
  CashJourneyOption,
  CashJourneyReport,
  CashJourneyRow,
} from "@erp/shared";
import { apiRequest, ApiRequestError } from "../../services/http";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import { DropDown } from "../controls";
import { displayDateTime } from "../controls/date-value";
import { amount } from "../cash-movement/format";
import { useActiveCash } from "../cash-movement/ActiveCash";
import { ReportView, type ReportQuery } from "./ReportView";
import {
  cashJourneyPresentation,
  cashJourneySummary,
  loadCashJourney,
} from "./cash-journey-report";
interface Filters {
  box: string;
  opening: string;
}
async function loadReport({ filters, signal }: ReportQuery<Filters>) {
  return loadCashJourney(filters.opening, signal, filters.box);
}
export function CashJourneyPage({ onExpired }: { onExpired: () => void }) {
  const { selected } = useActiveCash();
  const [initialFilters] = useState<Filters>(() => ({
    box: selected?.Caja ?? "",
    opening: selected?.IDTabla ?? "",
  }));
  return (
    <ReportView<CashJourneyRow, Filters, CashJourneyReport>
      {...cashJourneyPresentation}
      initialFilters={initialFilters}
      load={loadReport}
      onExpired={onExpired}
      filtersActive={(f) => Boolean(f.box || f.opening)}
      filterSummary={(f) =>
        f.opening
          ? "Caja: " + f.box + " · Jornada seleccionada"
          : "Seleccioná Caja y Jornada"
      }
      reportSummary={(data) => cashJourneySummary(data)}
      validateFilters={(f) =>
        !f.box || !f.opening
          ? "Seleccioná la caja y una jornada de su listado."
          : undefined
      }
      properties={{
        title: "Propiedades · Movimiento de jornada",
        fields: [
          ...cashJourneyPresentation.columns.map((c) => ({
            key: c.key,
            label: c.label,
            render: c.render,
          })),
          {
            key: "Modulo",
            label: "Tipo de movimiento",
            render: (r) =>
              r.Modulo === "TESORERIA"
                ? "Fondos internos de Tesorería"
                : "Cobros y pagos",
          },
          {
            key: "Estado",
            label: "Estado",
            render: (r) =>
              r.Estado === "REVERTIDO" ? "Revertido" : "Confirmado",
          },
          {
            key: "Original",
            label: "Operación original de la reversión",
            render: (r) => r.Original,
          },
          {
            key: "ImporteTotal",
            label: "Importe total de la operación",
            render: (r) => amount(r.ImporteTotal),
          },
        ],
      }}
      renderFilters={({ value, onChange }) => (
        <>
          <ReferenceSelect
            id="journey-report-box"
            field={{
              name: "Caja",
              label: "Caja",
              kind: "relation",
              relation: "cajas",
              relationLabelField: "Nombre",
              maxLength: 20,
            }}
            filter
            includeInactive
            value={value.box}
            onChange={(box) => onChange({ box, opening: "" })}
            onExpired={onExpired}
          />
          <JourneySelect
            box={value.box}
            value={value.opening}
            onChange={(opening) =>
              onChange((current) => ({ ...current, opening }))
            }
            onExpired={onExpired}
          />
          <p className="muted small">
            Cada opción identifica una apertura real, abierta o cerrada. El
            informe incluye todos sus movimientos; no depende de la caja activa
            ni limita por fecha de origen de los comprobantes.
          </p>
        </>
      )}
    />
  );
}
function JourneySelect({
  box,
  value,
  onChange,
  onExpired,
}: {
  box: string;
  value: string;
  onChange: (id: string) => void;
  onExpired: () => void;
}) {
  const [rows, setRows] = useState<CashJourneyOption[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setRows([]);
    setError("");
    if (!box) {
      setLoading(false);
      return;
    }
    const request = new AbortController();
    setLoading(true);
    void apiRequest<{ registros: CashJourneyOption[] }>(
      "/informes/caja/jornadas?" + new URLSearchParams({ Caja: box }),
      { signal: request.signal },
    )
      .then((d) => {
        if (!request.signal.aborted) {
          setRows(d.registros);
          if (value && !d.registros.some((o) => o.Clave === value))
            onChange("");
        }
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar las jornadas.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [box, revision]);
  return (
    <>
      <DropDown
        id="journey-report-opening"
        label="Jornada"
        value={value}
        required
        disabled={!box || loading || Boolean(error)}
        options={[
          {
            value: "",
            label: loading ? "Cargando jornadas…" : "Seleccioná una jornada",
          },
          ...rows.map((o, index) => ({
            value: o.Clave,
            label: `${displayDateTime(o.AperturaEn)} · ${o.Estado === "ABIERTO" ? "Abierta" : "Cerrada · " + displayDateTime(o.CierreEn)} · ${index + 1}`,
          })),
        ]}
        onValueChange={onChange}
      />
      {error && (
        <div>
          <p className="notice error" role="alert">
            {error}
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Reintentar jornadas
          </button>
        </div>
      )}
    </>
  );
}
