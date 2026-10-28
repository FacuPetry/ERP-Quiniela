import {
  useCallback,
  useId,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";

import { ActionToolbar } from "./ActionToolbar";
import { RecordProperties, type PropertyField } from "./RecordProperties";
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
  /** Valor de consulta cuando la celda contiene un editor. */
  property?: (row: T) => ReactNode;
}
export interface TableProperties<T> {
  title?: string;
  fields?: readonly PropertyField<T>[];
  loadRecord?: (row: T, signal: AbortSignal) => Promise<T>;
  onExpired?: () => void;
}
const noSessionHandler = () => {};
function TableRecordProperties<T>({
  row,
  columns,
  config,
  caption,
  onClose,
}: {
  row: T;
  columns: readonly TableColumn<T>[];
  config: TableProperties<T>;
  caption: string;
  onClose: () => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      config.loadRecord ? config.loadRecord(row, signal) : Promise.resolve(row),
    [row, config.loadRecord],
  );
  return (
    <RecordProperties
      title={config.title ?? `Propiedades · ${caption}`}
      loadRecord={load}
      fields={
        config.fields ??
        columns.map((column) => ({
          key: column.key,
          label: column.label,
          render: (record: T) => (
            <fieldset
              className="table-property-value"
              disabled
              onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onKeyDownCapture={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {(column.property ?? column.render)(record)}
            </fieldset>
          ),
        }))
      }
      onClose={onClose}
      onExpired={config.onExpired ?? noSessionHandler}
    />
  );
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
  properties = {},
  toolbar,
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
  /** Incluido por defecto. false cuando el toolbar externo ya consulta un detalle específico. */
  properties?: false | TableProperties<T>;
  toolbar?: (actions: {
    onProperties: () => void;
    selected: boolean;
  }) => ReactNode;
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
  const [localKey, setLocalKey] = useState<string | null>(null);
  const [localKeys, setLocalKeys] = useState<string[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [propertyRecord, setPropertyRecord] = useState<{ row: T } | null>(null);
  const singleKey = onSelectionChange ? selectedKey : localKey;
  const multipleKeys = onMultipleSelectionChange ? selectedKeys : localKeys;
  const changeSingle = onSelectionChange ?? setLocalKey;
  const changeMultiple = onMultipleSelectionChange ?? setLocalKeys;
  const multiple = selectionMode === "multiple";
  const selectable = true;
  const isSelected = (row: T) =>
    multiple ? multipleKeys.includes(rowKey(row)) : singleKey === rowKey(row);
  const visibleSelected = rows.filter(isSelected);
  const propertyRow =
    visibleSelected.find((row) => rowKey(row) === focusedKey) ??
    visibleSelected.at(-1);
  const showProperties = () => {
    if (propertyRow && !loading && !selectionDisabled)
      setPropertyRecord({ row: propertyRow });
  };
  const toggle = (row: T) => {
    const key = rowKey(row);
    setFocusedKey(key);
    if (multiple)
      changeMultiple(
        multipleKeys.includes(key)
          ? multipleKeys.filter((k) => k !== key)
          : [...multipleKeys, key],
      );
    else changeSingle(key);
  };
  return (
    <>
      {toolbar
        ? toolbar({
            onProperties: showProperties,
            selected: Boolean(propertyRow),
          })
        : properties !== false && (
            <div className="table-properties-toolbar">
              <ActionToolbar
                labels={{}}
                selected={Boolean(propertyRow)}
                busy={loading || selectionDisabled}
                readOnly
                filtersActive={false}
                onProperties={showProperties}
              />
            </div>
          )}
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
                  onFocusCapture={() => setFocusedKey(rowKey(row))}
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
                    if (
                      loading ||
                      selectionDisabled ||
                      interactiveTarget(event)
                    )
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
                          checked={singleKey === rowKey(row)}
                          disabled={loading || selectionDisabled}
                          onChange={() => {
                            setFocusedKey(rowKey(row));
                            changeSingle(rowKey(row));
                          }}
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
      {properties !== false && propertyRecord && (
        <TableRecordProperties
          row={propertyRecord.row}
          columns={columns}
          config={properties}
          caption={caption}
          onClose={() => setPropertyRecord(null)}
        />
      )}
    </>
  );
}
