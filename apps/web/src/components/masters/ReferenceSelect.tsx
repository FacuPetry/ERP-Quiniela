import { useEffect, useState, type ReactNode } from "react";
import type { MasterField, MasterRecord } from "@erp/shared";
import { referenceOptions } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import { DropDown, type FieldProps } from "../controls";

export function ReferenceSelect({
  field,
  id,
  value,
  onChange,
  disabled = false,
  filter = false,
  invalid = false,
  label = field.label,
  required = !filter && Boolean(field.required),
  error: validationError,
  hint,
  wide,
  onExpired,
  query = {},
  optionFilter,
}: Omit<FieldProps, "id" | "label"> & {
  label?: ReactNode;
  field: MasterField;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  filter?: boolean;
  onExpired: () => void;
  /** Filtros admitidos por la fuente de datos, definidos por el módulo. */
  query?: Record<string, string>;
  /** Restricción adicional por contexto; nunca habilita registros inactivos. */
  optionFilter?: (option: MasterRecord) => boolean;
}) {
  const [options, setOptions] = useState<MasterRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    setOptions([]);
    void referenceOptions(
      field.relation!,
      JSON.parse(queryKey) as Record<string, string>,
      request.signal,
    )
      .then((rows) => {
        if (!request.signal.aborted) setOptions(rows);
      })
      .catch((error) => {
        if (request.signal.aborted) return;
        if (error instanceof ApiRequestError && error.status === 401)
          onExpired();
        else setError("No se pudieron cargar las opciones.");
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [field.relation, queryKey, revision, onExpired]);
  const available = options.filter(
    (row) => row.Activo && (!optionFilter || optionFilter(row)),
  );
  const hasSelected = available.some((row) => row.Codigo === value);
  return (
    <DropDown
      id={id}
      label={label}
      value={value}
      required={required}
      disabled={disabled}
      loading={loading}
      invalid={invalid}
      error={validationError}
      wide={wide}
      placeholder={filter ? "Todos" : "Seleccioná una opción"}
      onValueChange={onChange}
      options={[
        { value: "", label: filter ? "Todos" : "Seleccioná una opción" },
        ...(value && !hasSelected
          ? [
              {
                value,
                label: `${value} · Referencia actual`,
                disabled: true,
                hidden: true,
              },
            ]
          : []),
        ...available.map((row) => ({
          value: row.Codigo,
          label: `${row.Codigo} · ${String(row.Descripcion ?? row.Nombre)}`,
        })),
      ]}
      hint={
        hint ||
        error ||
        (!loading && ((value && !hasSelected) || !available.length)) ? (
          <>
            {hint}
            {!loading && !error && value && !hasSelected && (
              <span className="field-hint">
                La referencia actual no está disponible para nuevas selecciones.
                Podés conservarla o elegir otra activa.
              </span>
            )}
            {!loading && !error && !available.length && (
              <span className="field-hint">
                No hay opciones activas disponibles.
              </span>
            )}
            {error && (
              <div className="reference-error">
                <span role="alert">{error}</span>
                <button type="button" onClick={() => setRevision(revision + 1)}>
                  Reintentar
                </button>
              </div>
            )}
          </>
        ) : undefined
      }
    />
  );
}
