import { useId, type ReactNode, type MouseEvent } from "react";

import { CheckBox } from "../controls/CheckBox";

function interactiveTarget(event: MouseEvent<HTMLTableRowElement>) {
  return (event.target as Element).closest(
    'a,button,input,select,textarea,label,[role="button"],[role="link"],[contenteditable]:not([contenteditable="false"])',
  );
}

export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowLabel = rowKey,
  loading,
  actions,
  bordered,
  selectedKey = null,
  selectionMode = "single",
  selectedKeys = [],
  onMultipleSelectionChange,
  onSelectionChange,
  onRowActivate,
  selectionDisabled = false,
  emptyMessage = "No hay registros para mostrar.",
}: {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Etiqueta legible de selección; la clave interna no necesita exponerse. */
  rowLabel?: (row: T) => string;
  loading: boolean;
  actions?: (row: T) => ReactNode;
  /** Sin configurar, los listados internos muestran el contorno definido por su contexto. */
  bordered?: boolean;
  selectedKey?: string | null;
  selectionMode?: "single" | "multiple";
  selectedKeys?: readonly string[];
  onMultipleSelectionChange?: (keys: string[]) => void;
  onSelectionChange?: (key: string) => void;
  /** Acción principal sobre la fila; comparte permisos y carga con el toolbar. */
  onRowActivate?: (row: T) => void;
  selectionDisabled?: boolean;
  /** Permite distinguir una grilla sin consultar de una búsqueda sin resultados. */
  emptyMessage?: ReactNode;
}) {
  const selectionGroup = useId();
  const multiple = selectionMode === "multiple";
  const selectable = multiple
    ? Boolean(onMultipleSelectionChange)
    : Boolean(onSelectionChange);
  const isSelected = (row: T) =>
    multiple ? selectedKeys.includes(rowKey(row)) : selectedKey === rowKey(row);
  const toggle = (row: T) => {
    const key = rowKey(row);
    if (multiple)
      onMultipleSelectionChange?.(
        selectedKeys.includes(key)
          ? selectedKeys.filter((k) => k !== key)
          : [...selectedKeys, key],
      );
    else onSelectionChange?.(key);
  };
  return (
    <div
      className="table-scroll"
      data-bordered={bordered}
      tabIndex={0}
      role="region"
      aria-label={caption}
      aria-busy={loading}
    >
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {multiple && (
              <th className="selection-column" scope="col">
                <span className="sr-only">Seleccionar</span>
              </th>
            )}
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
            {actions && (
              <th scope="col" className="actions-column">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                {...(selectable ? { "aria-selected": isSelected(row) } : {})}
                onClick={(event) => {
                  if (
                    !selectable ||
                    loading ||
                    selectionDisabled ||
                    interactiveTarget(event)
                  )
                    return;
                  toggle(row);
                  event.currentTarget
                    .querySelector<HTMLInputElement>(".row-selector")
                    ?.focus({ preventScroll: true });
                }}
                onDoubleClick={(event) => {
                  if (loading || selectionDisabled || interactiveTarget(event))
                    return;
                  onRowActivate?.(row);
                }}
              >
                {multiple && (
                  <td className="selection-column">
                    <CheckBox
                      label={
                        <span className="sr-only">{`Seleccionar ${rowLabel(row)}`}</span>
                      }
                      value={isSelected(row)}
                      disabled={loading || selectionDisabled || !selectable}
                      onValueChange={() => toggle(row)}
                    />
                  </td>
                )}
                {columns.map((column, index) => (
                  <td key={column.key}>
                    {selectable && !multiple && index === 0 && (
                      <input
                        className="row-selector sr-only"
                        type="radio"
                        name={selectionGroup}
                        aria-label={`Seleccionar ${rowLabel(row)}`}
                        checked={selectedKey === rowKey(row)}
                        disabled={loading || selectionDisabled}
                        onChange={() => onSelectionChange?.(rowKey(row))}
                      />
                    )}
                    {column.render(row)}
                  </td>
                ))}
                {actions && <td className="row-actions">{actions(row)}</td>}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={
                  columns.length + Number(Boolean(actions)) + Number(multiple)
                }
                className="table-empty"
              >
                {loading ? "Cargando registros…" : emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
