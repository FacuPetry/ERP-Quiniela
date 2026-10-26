import { useEffect, useState, type ReactNode } from "react";
import { OffCanvas } from "./OffCanvas";
import { ApiRequestError } from "../../services/http";

export interface PropertyField<T> {
  key: string;
  label: string;
  render: (record: T) => ReactNode;
  visible?: (record: T) => boolean;
}

/** Lectura genérica; el adaptador aporta fuente y campos permitidos, nunca un volcado del DTO. */
export function RecordProperties<T>({
  title,
  loadRecord,
  fields,
  onClose,
  onExpired,
}: {
  title: string;
  loadRecord: (signal: AbortSignal) => Promise<T>;
  fields: readonly PropertyField<T>[];
  onClose: () => void;
  onExpired: () => void;
}) {
  const [record, setRecord] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    setRecord(null);
    void loadRecord(request.signal)
      .then((value) => {
        if (!request.signal.aborted) setRecord(value);
      })
      .catch((error) => {
        if (request.signal.aborted) return;
        if (error instanceof ApiRequestError && error.status === 401)
          onExpired();
        else
          setError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las propiedades.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [loadRecord, retry, onExpired]);
  return (
    <OffCanvas open title={title} onClose={onClose}>
      <div aria-busy={loading}>
        {loading && (
          <p className="muted" role="status">
            Cargando propiedades…
          </p>
        )}
        {error && (
          <div className="properties-error">
            <p className="notice error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Reintentar
            </button>
          </div>
        )}
        {record !== null && (
          <dl className="properties-fields">
            {fields
              .filter((field) => !field.visible || field.visible(record))
              .map((field) => {
                const value = field.render(record);
                return (
                  <div key={field.key} className="properties-field">
                    <dt>{field.label}</dt>
                    <dd>{value == null || value === "" ? "—" : value}</dd>
                  </div>
                );
              })}
          </dl>
        )}
      </div>
    </OffCanvas>
  );
}
