import { useId, type ReactNode } from "react";

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
  loading,
  actions,
  selectedKey = null,
  onSelectionChange,
  selectionDisabled = false,
}: {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading: boolean;
  actions?: (row: T) => ReactNode;
  selectedKey?: string | null;
  onSelectionChange?: (key: string) => void;
  selectionDisabled?: boolean;
}) {
  const selectionGroup = useId();
  const selectable = Boolean(onSelectionChange);
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={caption}
      aria-busy={loading}
    >
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="selection-column">
                <span className="sr-only">Seleccionar registro</span>
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
                {...(selectable
                  ? { "aria-selected": selectedKey === rowKey(row) }
                  : {})}
                onClick={(event) => {
                  if (
                    !selectable ||
                    loading ||
                    selectionDisabled ||
                    (event.target as HTMLElement).closest(
                      "a,button,input,select,textarea,label",
                    )
                  )
                    return;
                  onSelectionChange?.(rowKey(row));
                }}
              >
                {selectable && (
                  <td className="selection-column">
                    <input
                      type="radio"
                      name={selectionGroup}
                      aria-label={`Seleccionar ${rowKey(row)}`}
                      checked={selectedKey === rowKey(row)}
                      disabled={loading || selectionDisabled}
                      onChange={() => onSelectionChange?.(rowKey(row))}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
                {actions && <td className="row-actions">{actions(row)}</td>}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={
                  columns.length + Number(selectable) + Number(Boolean(actions))
                }
                className="table-empty"
              >
                {loading
                  ? "Cargando registros…"
                  : "No hay registros para mostrar."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
