import { useEffect, useRef, useState } from "react";
import { TextBox } from "./TextBox";
import type { FieldProps } from "./Field";
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
  ...field
}: FieldProps & {
  value: T | null;
  onValueChange: (record: T | null) => void;
  search: (
    query: string,
    page: number,
    signal: AbortSignal,
  ) => Promise<SearchResult<T>>;
  getCode: (record: T) => string;
  getDescription: (record: T) => string;
  columns: readonly TableColumn<T>[];
  title: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(() => (value ? getCode(value) : ""));
  const [result, setResult] = useState<SearchResult<T> | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (value) setQuery(getCode(value));
  }, [value, getCode]);
  function choose(row: T) {
    onValueChange(row);
    setQuery(getCode(row));
    setOpen(false);
    setMessage("");
    requestAnimationFrame(() => input.current?.focus());
  }
  async function find(page = 1) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage("");
    setSelected(null);
    try {
      const data = await search(query.trim(), page, controller.signal);
      if (controller.signal.aborted) return;
      setResult(data);
      if (data.total === 1 && data.registros[0]) choose(data.registros[0]);
      else if (!data.total && !open)
        setMessage("No se encontraron coincidencias.");
      else setOpen(true);
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
  return (
    <div className={field.wide ? "wide sf-field" : "sf-field"}>
      <div className="sf-line">
        <TextBox
          {...field}
          ref={input}
          value={query}
          disabled={disabled || busy}
          hint={
            <>
              {value
                ? getDescription(value)
                : "Ingresá código o descripción y presioná Buscar."}
              {message && (
                <span role="status" className="field-hint">
                  {message}
                </span>
              )}
              {field.hint}
            </>
          }
          onValueChange={(text) => {
            setQuery(text);
            setMessage("");
            onValueChange(null);
          }}
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
          disabled={disabled || busy}
          onClick={() => {
            void find();
          }}
        >
          <Icon name="search" />
        </button>
      </div>
      {open && (
        <Modal title={`Seleccionar ${title}`} busy={busy} onClose={close}>
          <div className="modal-body">
            <div className="sf-line">
              <TextBox
                label="Buscar por código o descripción"
                value={query}
                onValueChange={(text) => {
                  setQuery(text);
                  onValueChange(null);
                }}
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
            {message && (
              <p className="notice error" role="alert">
                {message}
              </p>
            )}
            <DataTable
              caption={`Resultados de ${title}`}
              rows={result?.registros ?? []}
              columns={columns}
              rowKey={getCode}
              rowLabel={getDescription}
              loading={busy}
              selectedKey={selected ? getCode(selected) : null}
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
    </div>
  );
}
