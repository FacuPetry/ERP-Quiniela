import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ListSort } from "@erp/shared";
import { ApiRequestError } from "../../services/http";
import { Icon, type IconName } from "../Icon";
import { ActionToolbar } from "../ui/ActionToolbar";
import {
  DataTable,
  type TableColumn,
  type TableProperties,
} from "../ui/DataTable";
import { Modal } from "../ui/Modal";
import { Pagination } from "../ui/Pagination";
import { useListSorting } from "../ui/useListSorting";
import "./reports.css";
export interface ReportResult<T> {
  registros: T[];
  total: number;
  pagina: number;
  limite: number;
}
export interface ReportQuery<F> {
  filters: F;
  page: number;
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
  description,
  caption,
  icon = "file",
  badge,
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
  renderSummary,
  renderNotes,
  onExpired,
}: {
  title: string;
  description: string;
  caption: string;
  icon?: IconName;
  badge?: string;
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
  renderSummary?: (data: R) => ReactNode;
  renderNotes?: (data: R | null) => ReactNode;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters),
    [filtering, setFiltering] = useState(true);
  const [requested, setRequested] = useState(false),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<R | null>(null),
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
    void load({ filters, page, sort: sorting.value, signal: c.signal })
      .then((result) => {
        if (c.signal.aborted) return;
        if (page > 1 && !result.registros.length) {
          setPage(Math.max(1, Math.ceil(result.total / result.limite)));
          return;
        }
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
  }, [requested, filters, page, revision, sorting.value, load, onExpired]);
  function apply(value: F) {
    setFilters(value);
    setPage(1);
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
      <section className="panel report-introduction">
        <span className="section-icon">
          <Icon name={icon} />
        </span>
        <div>
          <h2>{title}</h2>
          <p className="muted small">{description}</p>
        </div>
        {badge && <span className="badge">{badge}</span>}
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {data && renderSummary?.(data)}
      <section className="panel report-results">
        <DataTable
          caption={caption}
          rows={data?.registros ?? []}
          columns={columns}
          rowKey={rowKey}
          {...(rowLabel ? { rowLabel } : {})}
          loading={loading}
          selectedKey={selected}
          onSelectionChange={setSelected}
          sort={sorting.value}
          onSortChange={sorting.onChange}
          bordered={false}
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
                <h2>{caption}</h2>
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
        {data && (
          <Pagination
            page={data.pagina}
            total={data.total}
            limit={data.limite}
            loading={loading}
            onChange={setPage}
          />
        )}
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
