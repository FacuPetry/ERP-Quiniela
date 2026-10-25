import { useEffect, useState } from "react";
import type { MasterField, MasterList } from "@erp/shared";
import { listMasters } from "../../services/masters";
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
}: {
  field: MasterField;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  filter?: boolean;
  invalid?: boolean;
  onExpired: () => void;
}) {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<MasterList | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    const timeout = setTimeout(() => {
      setError("");
      void listMasters(
        field.relation!,
        { q: search, estado: filter ? "todos" : "activo", limite: "100" },
        request.signal,
      )
        .then((data) => {
          if (!request.signal.aborted) setResult(data);
        })
        .catch((error) => {
          if (request.signal.aborted) return;
          if (error instanceof ApiRequestError && error.status === 401)
            onExpired();
          else setError("No se pudieron cargar las opciones.");
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      request.abort();
    };
  }, [field.relation, search, revision, filter, onExpired]);
  const hasSelected = result?.registros.some((row) => row.Codigo === value);
  return (
    <div className="reference-select">
      <input
        type="search"
        aria-label={`Buscar ${field.label.toLocaleLowerCase("es-AR")}`}
        placeholder="Buscar opciones…"
        value={search}
        maxLength={100}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        id={id}
        value={value}
        required={!filter && field.required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{filter ? "Todos" : "Seleccioná una opción"}</option>
        {value && !hasSelected && (
          <option value={value}>{value} · Selección actual</option>
        )}
        {result?.registros.map((row) => (
          <option value={row.Codigo} key={row.Codigo}>
            {row.Codigo} · {String(row.Descripcion ?? row.Nombre)}
            {!row.Activo ? " (inactivo)" : ""}
          </option>
        ))}
      </select>
      {result && result.total > result.registros.length && (
        <span className="field-hint">
          Hay más opciones. Refiná la búsqueda para encontrarlas.
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
    </div>
  );
}
