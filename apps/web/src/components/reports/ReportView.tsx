import {
  useEffect,
  useCallback,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ListSort } from "@erp/shared";
import { ApiRequestError } from "../../services/http";
import { ActionToolbar } from "../ui/ActionToolbar";
import {
  DataTable,
  type TableColumn,
  type TableProperties,
  type TableTotals,
  type BalancePlacement,
} from "../ui/DataTable";
import { Modal } from "../ui/Modal";
import { ReportKpis, type ReportKpi } from "./ReportKpis";
import "./reports.css";
export interface ReportResult<T> {
  registros: T[];
  total: number;
}
export interface ReportQuery<F> {
  filters: F;
  /** Todos los informes solicitan una colección coherente para scroll continuo. */
  parameters: { continuo: "1" };
  sort: ListSort | null;
  signal: AbortSignal;
}
export interface ReportFilterEditor<F> {
  value: F;
  onChange: Dispatch<SetStateAction<F>>;
}
/** Estado de consulta y presentación comunes. Cada informe aporta filtros,
 * columnas y datos; la base no interpreta importes ni reglas financieras. */
export function ReportView<T, F, R extends ReportResult<T>>({
  title,
  caption,
  initialFilters,
  renderFilters,
  validateFilters,
  filtersActive,
  filterSummary,
  load,
  columns,
  rowKey,
  rowLabel,
  properties,
  kpis,
  totals,
  openingBalance,
  closingBalance,
  closingBalancePlacement = "beforeTotals",
  showEmptyMessage = true,
  renderNotes,
  onExpired,
}: {
  title: string;
  caption: string;
  initialFilters: F;
  renderFilters: (editor: ReportFilterEditor<F>) => ReactNode;
  validateFilters?: (filters: F) => string | undefined;
  filtersActive: (filters: F) => boolean;
  filterSummary: (filters: F) => ReactNode;
  /** Mantener estable con una función de módulo o useCallback. */
  load: (query: ReportQuery<F>) => Promise<R>;
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  rowLabel?: (row: T) => string;
  properties?: TableProperties<T>;
  /** Opcional y sin indicadores predeterminados; solo usa una consulta aceptada. */
  kpis?: (data: R) => readonly ReportKpi[];
  totals?: (data: R) => TableTotals | readonly TableTotals[] | undefined;
  openingBalance?: (data: R) => TableTotals | undefined;
  closingBalance?: (data: R) => TableTotals | undefined;
  closingBalancePlacement?: BalancePlacement;
  /** Configurable por informe; los demás conservan sus mensajes habituales. */
  showEmptyMessage?: boolean;
  renderNotes?: (data: R | null) => ReactNode;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters),
    [filtering, setFiltering] = useState(true);
  const [requested, setRequested] = useState(false),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<R | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [visible, setVisible] = useState(200);
  const showMore = useCallback(() => setVisible((n) => n + 200), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<ListSort | null>(null);
  useEffect(() => {
    if (!requested) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setVisible(200);
    setSelected(null);
    void load({
      filters,
      parameters: { continuo: "1" },
      sort,
      signal: c.signal,
    })
      .then((result) => {
        if (c.signal.aborted) return;
        if (result.registros.length !== result.total)
          throw new Error(
            "No se pudo obtener el informe completo. Volvé a consultar.",
          );
        setData(result);
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else
          setError(
            e instanceof Error ? e.message : "No se pudo consultar el informe.",
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [requested, filters, revision, sort, load, onExpired]);
  function apply(value: F) {
    setFilters(value);
    setRequested(true);
    setRevision((v) => v + 1);
    setFiltering(false);
  }
  function refresh() {
    if (!requested) {
      setFiltering(true);
      return;
    }
    setRevision((v) => v + 1);
  }
  return (
    <div className="report-layout">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {data && kpis && <ReportKpis items={kpis(data)} />}
      <section
        className="panel report-results"
        key={`${revision}:${sort?.campo ?? ""}:${sort?.direccion ?? ""}`}
      >
        <DataTable
          caption={title}
          rows={data?.registros.slice(0, visible) ?? []}
          columns={columns}
          rowKey={rowKey}
          {...(rowLabel ? { rowLabel } : {})}
          loading={loading}
          selectedKey={selected}
          onSelectionChange={setSelected}
          sort={sort}
          onSortChange={setSort}
          onEndReached={
            data && visible < data.registros.length ? showMore : undefined
          }
          bordered={false}
          totals={
            data && visible >= data.registros.length && totals
              ? totals(data)
              : undefined
          }
          openingBalance={
            data && openingBalance ? openingBalance(data) : undefined
          }
          closingBalance={
            data && visible >= data.registros.length && closingBalance
              ? closingBalance(data)
              : undefined
          }
          closingBalancePlacement={closingBalancePlacement}
          showEmptyMessage={showEmptyMessage}
          properties={{ ...properties, onExpired }}
          emptyMessage={
            error
              ? "No se pudo consultar el informe."
              : requested
                ? "No hay registros para mostrar."
                : "Aplicá los filtros para consultar la información."
          }
          toolbar={(actions) => (
            <div className="report-toolbar">
              <div>
                <span className="sr-only">{caption}</span>
                <p className="muted small">
                  {requested
                    ? filterSummary(filters)
                    : "Todavía no se realizó una consulta."}
                </p>
              </div>
              <ActionToolbar
                labels={{
                  filter: "Filtros del informe",
                  refresh: "Actualizar informe",
                }}
                readOnly
                busy={false}
                refreshing={loading}
                selected={actions.selected}
                filtersActive={requested && filtersActive(filters)}
                onFilter={() => setFiltering(true)}
                onRefresh={refresh}
                onProperties={actions.onProperties}
              />
            </div>
          )}
        />
      </section>
      {renderNotes?.(data)}
      {filtering && (
        <ReportFilters
          value={filters}
          defaults={initialFilters}
          render={renderFilters}
          {...(validateFilters ? { validate: validateFilters } : {})}
          onApply={apply}
          onClose={() => setFiltering(false)}
        />
      )}
    </div>
  );
}
function ReportFilters<F>({
  value,
  defaults,
  render,
  validate,
  onApply,
  onClose,
}: {
  value: F;
  defaults: F;
  render: (editor: ReportFilterEditor<F>) => ReactNode;
  validate?: (value: F) => string | undefined;
  onApply: (value: F) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  const [reset, setReset] = useState(0);
  const change: Dispatch<SetStateAction<F>> = (next) => {
    setError("");
    setDraft(next);
  };
  return (
    <Modal
      title="Filtros del informe"
      busy={false}
      onClose={onClose}
      lockScroll
      restoreFocus
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const message = validate?.(draft);
          if (message) {
            setError(message);
            return;
          }
          onApply(draft);
        }}
      >
        <div className="modal-body">
          <p className="muted small">
            Seleccioná los filtros y presioná Aceptar para consultar.
          </p>
          <div className="report-filter-fields" key={reset}>
            {render({ value: draft, onChange: change })}
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary clear-filters"
            onClick={() => {
              setDraft(defaults);
              setError("");
              setReset((v) => v + 1);
            }}
          >
            Limpiar
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Aceptar
          </button>
        </div>
      </form>
    </Modal>
  );
}
