import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MasterDefinition, MasterDetail, MasterRecord } from "@erp/shared";
import { saveMaster } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
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
  onSaved: (detail: MasterDetail) => void;
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
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const automatic = Boolean(master.automaticCode && !previous);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const first = master.fields.find((field) => fields[field.name]);
      if (first) document.getElementById(`master-${first.name}`)?.focus();
      else summary.current?.focus();
    });
  }
  function change(name: string, value: string | boolean) {
    setRecord((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readOnly) return;
    const invalid: Record<string, string> = {};
    for (const field of master.fields) {
      if (automatic && field.name === "Codigo") continue;
      const text = String(record[field.name] ?? "").trim();
      if (field.required && !text) invalid[field.name] = "Completá este campo.";
      else if (text.length > field.maxLength)
        invalid[field.name] = `Hasta ${field.maxLength} caracteres.`;
      else if (
        field.kind === "email" &&
        text &&
        event.currentTarget.querySelector<HTMLInputElement>(
          `#master-${field.name}`,
        )?.validity.typeMismatch
      )
        invalid[field.name] = "Ingresá un correo válido.";
    }
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setError("Revisá los campos indicados.");
      focusError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const saved = await saveMaster(master.key, record, csrf, previous);
      onSaved(saved);
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
      focusError(error instanceof ApiRequestError ? error.campos : {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel record-form"
      aria-labelledby="record-form-title"
      aria-busy={busy}
    >
      <div className="form-heading">
        <h2
          id="record-form-title"
          ref={heading}
          tabIndex={-1}
        >{`${readOnly ? "Consultar" : previous ? "Modificar" : master.feminine ? "Nueva" : "Nuevo"} ${master.singular}`}</h2>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="form-body">
          <p className="muted small">
            {readOnly
              ? "Datos del registro seleccionado."
              : "Los campos con * son obligatorios."}
          </p>
          {error && (
            <div
              ref={summary}
              tabIndex={-1}
              className="notice error"
              role="alert"
            >
              {error}
              {Object.values(errors).some(Boolean) && (
                <ul>
                  {master.fields
                    .filter((field) => errors[field.name])
                    .map((field) => (
                      <li key={field.name}>
                        {field.label}: {errors[field.name]}
                      </li>
                    ))}
                </ul>
              )}
            </div>
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
                    {field.required &&
                    !readOnly &&
                    !(automatic && field.name === "Codigo")
                      ? " *"
                      : ""}
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
                      required={Boolean(
                        field.required &&
                          !(automatic && field.name === "Codigo"),
                      )}
                      maxLength={field.maxLength}
                      disabled={disabled}
                      readOnly={
                        field.name === "Codigo" &&
                        (Boolean(previous) || automatic)
                      }
                      placeholder={
                        automatic && field.name === "Codigo"
                          ? "Se asignará al guardar"
                          : undefined
                      }
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
                  {field.name === "Codigo" && automatic && (
                    <span className="field-hint">
                      El código se asignará automáticamente al guardar.
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
        <div className="form-actions">
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
    </section>
  );
}
