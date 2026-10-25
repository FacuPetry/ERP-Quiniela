import { useEffect, useState } from "react";
import type { MasterField, MasterRecord } from "@erp/shared";
import { referenceOptions } from "../../services/masters";
import { ApiRequestError } from "../../services/http";

export function ReferenceSelect({
  field,
  id,
  value,
  onChange,
  disabled = false,
  filter = false,
  invalid = false,
  onExpired,
  query = {},
  optionFilter,
}: {
  field: MasterField;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  filter?: boolean;
  invalid?: boolean;
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
    <div className="reference-select">
      <select
        id={id}
        value={value}
        required={!filter && field.required}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading
            ? "Cargando opciones…"
            : filter
              ? "Todos"
              : "Seleccioná una opción"}
        </option>
        {value && !hasSelected && (
          <option value={value} disabled hidden>
            {value} · Referencia actual
          </option>
        )}
        {available.map((row) => (
          <option value={row.Codigo} key={row.Codigo}>
            {row.Codigo} · {String(row.Descripcion ?? row.Nombre)}
          </option>
        ))}
      </select>
      {!loading && !error && value && !hasSelected && (
        <span className="field-hint">
          La referencia actual no está disponible para nuevas selecciones. Podés
          conservarla o elegir otra activa.
        </span>
      )}
      {!loading && !error && !available.length && (
        <span className="field-hint">No hay opciones activas disponibles.</span>
      )}
      {error && (
        <div className="reference-error">
          <span role="alert">{error}</span>
          <button type="button" onClick={() => setRevision(revision + 1)}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
