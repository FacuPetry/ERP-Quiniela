import { type ListSort } from "@erp/shared";
import { useEffect, useRef, useState } from "react";
import { Field, type FieldProps } from "./Field";
import { Modal } from "../ui/Modal";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { Icon } from "../Icon";
import "./search-field.css";
export interface SearchResult<T> {
  registros: T[];
  total: number;
  pagina: number;
  limite: number;
}
/** SF genérico: la entidad, las columnas y su API pertenecen al módulo consumidor. */
export function SearchField<T>({
  value,
  onValueChange,
  search,
  getCode,
  getDescription,
  columns,
  title,
  disabled = false,
  placeholder = "Ingrese un valor para buscar...",
  ...field
}: FieldProps & {
  value: T | null;
  onValueChange: (record: T | null) => void;
  search: (
    query: string,
    page: number,
    signal: AbortSignal,
    sort?: ListSort | null,
  ) => Promise<SearchResult<T>>;
  getCode: (record: T) => string;
  getDescription: (record: T) => string;
  columns: readonly TableColumn<T>[];
  title: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [sort, setSort] = useState<ListSort | null>(null);
  const [query, setQuery] = useState(() => (value ? getCode(value) : ""));
  const [result, setResult] = useState<SearchResult<T> | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [notFound, setNotFound] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null),
    editing = useRef(false),
    previousValue = useRef(value);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (value) {
      setQuery(getCode(value));
      setNotFound(false);
      setMessage("");
    } else if (previousValue.current !== null && !editing.current) {
      setQuery("");
    }
    // Un callback nuevo no debe borrar un criterio que aún no tiene selección.
    previousValue.current = value;
    editing.current = false;
  }, [value, getCode]);
  useEffect(() => {
    if (disabled) {
      request.current?.abort();
      setBusy(false);
      setOpen(false);
    }
  }, [disabled]);
  function changeQuery(text: string) {
    request.current?.abort();
    editing.current = true;
    setQuery(text);
    setBusy(false);
    setResult(null);
    setSelected(null);
    setMessage("");
    onValueChange(null);
  }
  function choose(row: T) {
    onValueChange(row);
    setQuery(getCode(row));
    setOpen(false);
    setMessage("");
    setNotFound(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  function clear() {
    request.current?.abort();
    editing.current = false;
    setQuery("");
    setResult(null);
    setSelected(null);
    setOpen(false);
    setBusy(false);
    setMessage("");
    setNotFound(false);
    onValueChange(null);
    requestAnimationFrame(() => input.current?.focus());
  }
  async function find(page = 1, order = sort) {
    if (disabled) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    editing.current = true;
    onValueChange(null);
    setBusy(true);
    setMessage("");
    setSelected(null);
    try {
      const data = await search(query.trim(), page, controller.signal, order);
      if (controller.signal.aborted) return;
      setResult(data);
      setNotFound(data.total === 0);
      if (data.total === 1 && data.registros[0]) choose(data.registros[0]);
      else if (!data.total) {
        setMessage("No se encontraron coincidencias.");
      } else setOpen(true);
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo realizar la búsqueda.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function close() {
    request.current?.abort();
    setBusy(false);
    setOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  const hint = message ? (
    <>
      <span role="status">{message}</span>
      {field.hint}
    </>
  ) : (
    field.hint
  );
  return (
    <>
      <Field {...field} invalid={field.invalid || notFound} hint={hint}>
        {(binding) => (
          <div className="control-group sf-line" aria-busy={busy}>
            <input
              {...binding}
              ref={input}
              className="base-control base-textbox sf-input"
              data-not-found={notFound || undefined}
              type="text"
              placeholder={placeholder}
              value={
                value ? `${getCode(value)} - ${getDescription(value)}` : query
              }
              required={field.required}
              disabled={disabled || busy}
              onChange={(event) => changeQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void find();
                }
              }}
            />
            <button
              type="button"
              className="icon-button sf-action"
              aria-label={`Buscar ${title}`}
              title={`Buscar ${title}`}
              disabled={disabled || busy}
              onClick={() => {
                void find();
              }}
            >
              <Icon name="search" />
            </button>
            <button
              type="button"
              className="icon-button sf-action"
              aria-label={`Limpiar ${title}`}
              title={`Limpiar ${title}`}
              disabled={disabled}
              onClick={clear}
            >
              <Icon name="eraser" />
            </button>
          </div>
        )}
      </Field>
      {open && (
        <Modal title={`Seleccionar ${title}`} busy={busy} onClose={close}>
          <div className="modal-body">
            <Field label="Buscar por código o descripción">
              {(binding) => (
                <div className="control-group sf-line">
                  <input
                    {...binding}
                    className="base-control base-textbox sf-input"
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    data-not-found={notFound || undefined}
                    aria-invalid={notFound}
                    onChange={(event) => changeQuery(event.currentTarget.value)}
                    disabled={busy}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void find();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary sf-action"
                    disabled={busy}
                    onClick={() => {
                      void find();
                    }}
                  >
                    Buscar
                  </button>
                </div>
              )}
            </Field>
            {message && (
              <p className="notice error" role="alert">
                {message}
              </p>
            )}
            <DataTable
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                void find(1, next);
              }}
              caption={`Resultados de ${title}`}
              rows={result?.registros ?? []}
              columns={columns}
              rowKey={getCode}
              rowLabel={(row) => `${getCode(row)} - ${getDescription(row)}`}
              loading={busy}
              selectedKey={selected ? getCode(selected) : null}
              selectionDisabled={busy}
              onSelectionChange={(code) =>
                setSelected(
                  result?.registros.find((row) => getCode(row) === code) ??
                    null,
                )
              }
              onRowActivate={choose}
            />
            {result && (
              <Pagination
                page={result.pagina}
                total={result.total}
                limit={result.limite}
                loading={busy}
                onChange={(page) => {
                  void find(page);
                }}
              />
            )}
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy || !selected}
              onClick={() => {
                if (selected) choose(selected);
              }}
            >
              Seleccionar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
