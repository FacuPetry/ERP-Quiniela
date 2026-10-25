import { useState, type FormEvent } from "react";
import type { MasterDefinition, MasterDetail, MasterRecord } from "@erp/shared";
import { saveMaster } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import { Modal } from "../ui/Modal";
import { ReferenceSelect } from "./ReferenceSelect";

export function MasterForm({
  master,
  previous,
  csrf,
  readOnly,
  onClose,
  onSaved,
  onExpired,
}: {
  master: MasterDefinition;
  previous?: MasterDetail;
  csrf: string;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const [record, setRecord] = useState<MasterRecord>(
    () =>
      previous?.registro ??
      (Object.fromEntries([
        ...master.fields.map((field) => [field.name, ""]),
        ["Activo", true],
      ]) as MasterRecord),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  function change(name: string, value: string | boolean) {
    setRecord((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await saveMaster(master.key, record, csrf, previous);
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        onExpired();
        return;
      }
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el registro.",
      );
      if (error instanceof ApiRequestError) setErrors(error.campos);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${readOnly ? "Consultar" : previous ? "Modificar" : master.feminine ? "Nueva" : "Nuevo"} ${master.singular}`}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="modal-body">
          <p className="muted small">
            {readOnly
              ? "Datos del registro seleccionado."
              : "Los campos con * son obligatorios."}
          </p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="form-grid">
            {master.fields.map((field) => {
              const id = `master-${field.name}`;
              const disabled = busy || readOnly;
              return (
                <div
                  key={field.name}
                  className={`form-field ${field.kind === "textarea" ? "wide" : ""}`}
                >
                  <label htmlFor={id}>
                    {field.label}
                    {field.required && !readOnly ? " *" : ""}
                  </label>
                  {field.kind === "relation" ? (
                    <ReferenceSelect
                      field={field}
                      id={id}
                      value={String(record[field.name] ?? "")}
                      disabled={disabled}
                      invalid={Boolean(errors[field.name])}
                      onChange={(value) => change(field.name, value)}
                      onExpired={onExpired}
                    />
                  ) : field.kind === "textarea" ? (
                    <textarea
                      id={id}
                      value={String(record[field.name] ?? "")}
                      disabled={disabled}
                      maxLength={field.maxLength}
                      rows={3}
                      aria-invalid={Boolean(errors[field.name])}
                      aria-describedby={
                        errors[field.name] ? `${id}-error` : undefined
                      }
                      onChange={(event) =>
                        change(field.name, event.target.value)
                      }
                    />
                  ) : (
                    <input
                      id={id}
                      type={field.kind === "email" ? "email" : "text"}
                      value={String(record[field.name] ?? "")}
                      required={Boolean(field.required)}
                      maxLength={field.maxLength}
                      disabled={disabled}
                      readOnly={field.name === "Codigo" && Boolean(previous)}
                      aria-invalid={Boolean(errors[field.name])}
                      aria-describedby={
                        errors[field.name] ? `${id}-error` : undefined
                      }
                      onChange={(event) =>
                        change(field.name, event.target.value)
                      }
                    />
                  )}
                  {field.name === "Codigo" && previous && !readOnly && (
                    <span className="field-hint">
                      El código se conserva para mantener sus relaciones.
                    </span>
                  )}
                  {errors[field.name] && (
                    <p id={`${id}-error`} className="field-error">
                      {errors[field.name]}
                    </p>
                  )}
                </div>
              );
            })}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={record.Activo}
                disabled={busy || readOnly}
                onChange={(event) => change("Activo", event.target.checked)}
              />
              Registro activo
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {readOnly ? "Cerrar" : "Cancelar"}
          </button>
          {!readOnly && (
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
