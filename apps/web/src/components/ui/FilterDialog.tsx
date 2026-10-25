import { useState } from "react";
import type { MasterField } from "@erp/shared";
import { Modal } from "./Modal";
import { ReferenceSelect } from "../masters/ReferenceSelect";

export interface FilterField {
  key: string;
  label: string;
  kind: "select" | "relation" | "text" | "date";
  options?: readonly { value: string; label: string }[];
  reference?: MasterField;
}
export function FilterDialog({
  fields,
  values,
  defaults,
  onApply,
  onClose,
  onExpired,
}: {
  fields: readonly FilterField[];
  values: Record<string, string>;
  defaults: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [draft, setDraft] = useState({ ...values });
  const [reset, setReset] = useState(0);
  const change = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Modal title="Filtrar registros" onClose={onClose} busy={false}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <div className="modal-body">
          <p className="muted small">
            Configurá los filtros y presioná Aplicar. La búsqueda general se
            conserva.
          </p>
          <div className="form-grid">
            {fields.map((field) => {
              const id = `filter-${field.key}`;
              return (
                <div className="form-field" key={field.key}>
                  <label htmlFor={id}>{field.label}</label>
                  {field.kind === "relation" && field.reference ? (
                    <ReferenceSelect
                      key={reset}
                      field={field.reference}
                      id={id}
                      value={draft[field.key] ?? ""}
                      onChange={(value) => change(field.key, value)}
                      filter
                      onExpired={onExpired}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      id={id}
                      value={draft[field.key] ?? ""}
                      onChange={(event) =>
                        change(field.key, event.target.value)
                      }
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={field.kind === "date" ? "date" : "text"}
                      value={draft[field.key] ?? ""}
                      maxLength={100}
                      onChange={(event) =>
                        change(field.key, event.target.value)
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary clear-filters"
            onClick={() => {
              setDraft({ ...defaults });
              setReset((value) => value + 1);
            }}
          >
            Limpiar
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Aplicar filtros
          </button>
        </div>
      </form>
    </Modal>
  );
}
