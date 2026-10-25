import { useState } from "react";
import type { MasterField } from "@erp/shared";
import { Modal } from "./Modal";
import { ReferenceSelect } from "../masters/ReferenceSelect";
import { Field, TextBox } from '../controls';

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
              if (field.kind === 'text') return <TextBox key={field.key} id={id} label={field.label} value={draft[field.key] ?? ''} maxLength={100} onValueChange={value => change(field.key, value)} />;
              return <Field key={field.key} id={id} label={field.label}>{binding =>
                field.kind === 'relation' && field.reference ? <ReferenceSelect key={reset} field={field.reference} id={binding.id} value={draft[field.key] ?? ''} onChange={value => change(field.key, value)} filter onExpired={onExpired} />
                  : field.kind === 'select' ? <select {...binding} className="base-control" value={draft[field.key] ?? ''} onChange={event => change(field.key, event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  : <input {...binding} className="base-control" type="date" value={draft[field.key] ?? ''} onChange={event => change(field.key, event.target.value)} />
              }</Field>;
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
