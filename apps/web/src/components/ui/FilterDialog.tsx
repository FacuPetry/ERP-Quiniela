import { useState } from "react";
import type { MasterField } from "@erp/shared";
import { Modal } from "./Modal";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import { DatePicker, TextBox, DropDown } from "../controls";

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
            Configurá la búsqueda y los filtros y presioná Aplicar.
          </p>
          <div className="form-grid">
            {fields.map((field) => {
              const id = `filter-${field.key}`;
              if (field.kind === "text")
                return (
                  <TextBox
                    key={field.key}
                    id={id}
                    label={field.label}
                    value={draft[field.key] ?? ""}
                    maxLength={100}
                    onValueChange={(value) => change(field.key, value)}
                  />
                );
              if (field.kind === "relation" && field.reference)
                return (
                  <ReferenceSelect
                    key={`${field.key}-${reset}`}
                    field={field.reference}
                    id={id}
                    label={field.label}
                    value={draft[field.key] ?? ""}
                    onChange={(value) => change(field.key, value)}
                    filter
                    onExpired={onExpired}
                  />
                );
              if (field.kind === "select")
                return (
                  <DropDown
                    key={field.key}
                    id={id}
                    label={field.label}
                    value={draft[field.key] ?? ""}
                    options={field.options ?? []}
                    onValueChange={(value) => change(field.key, value)}
                  />
                );
              return (
                <DatePicker
                  key={`${field.key}-${reset}`}
                  id={id}
                  label={field.label}
                  value={draft[field.key] ?? ""}
                  onValueChange={(value) => change(field.key, value)}
                />
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
