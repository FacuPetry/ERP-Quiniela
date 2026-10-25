import type { ReactNode } from "react";

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
}: {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading: boolean;
  actions: (row: T) => ReactNode;
}) {
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
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
            <th scope="col" className="actions-column">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
                <td className="row-actions">{actions(row)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 1} className="table-empty">
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
