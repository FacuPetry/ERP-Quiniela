import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  MasterDefinition,
  MasterDetail,
  MasterRecord,
  MasterField,
} from "@erp/shared";
import {
  integerFieldError,
  masterFormFields,
  voucherNumberError,
} from "@erp/shared";
import { saveMaster, suggestClientCode } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import { ReferenceSelect } from "./ReferenceSelect";
import {
  TextBox,
  TextArea,
  CheckBox,
  DropDown,
  NumeroComprobante,
  initialMasterFieldValue,
} from "../controls";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";

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
        ...master.fields.map((field) => [
          field.name,
          initialMasterFieldValue(field, master.primaryKey ?? "Codigo"),
        ]),
        ["Activo", true],
      ]) as MasterRecord),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const identity = master.primaryKey ?? "Codigo";
  const visibleFields = masterFormFields(master);
  const automatic = Boolean(master.automaticCode && !previous);
  const formId = useId();
  const [suggestionLoading, setSuggestionLoading] = useState(automatic);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionRevision, setSuggestionRevision] = useState(0);
  useEffect(() => {
    if (!automatic) return;
    const request = new AbortController();
    setSuggestionLoading(true);
    setSuggestionError("");
    void suggestClientCode(request.signal)
      .then((result) => {
        if (!request.signal.aborted)
          setRecord((current) => ({ ...current, Codigo: result.codigo }));
      })
      .catch((error) => {
        if (request.signal.aborted) return;
        if (error instanceof ApiRequestError && error.status === 401)
          onExpired();
        else
          setSuggestionError(
            error instanceof Error
              ? error.message
              : "No se pudo consultar el código sugerido.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setSuggestionLoading(false);
      });
    return () => request.abort();
  }, [automatic, suggestionRevision, onExpired]);
  useInitialFieldFocus(form, heading);
  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const first = visibleFields.find((field) => fields[field.name]);
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
    for (const field of visibleFields) {
      if (automatic && field.name === "Codigo" && !previous) continue;
      const text = String(record[field.name] ?? "").trim();
      if (field.required && !text) invalid[field.name] = "Completá este campo.";
      else if (text.length > field.maxLength)
        invalid[field.name] = `Hasta ${field.maxLength} caracteres.`;
      else if (field.kind === "voucher") {
        const message = voucherNumberError(text);
        if (message) invalid[field.name] = message;
      } else if (field.kind === "integer") {
        const message = integerFieldError(field, text);
        if (message) invalid[field.name] = message;
      } else if (
        field.kind === "select" &&
        !field.options?.some((option) => option.value === text)
      )
        invalid[field.name] = "Seleccioná una opción válida.";
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
  function renderField(field: MasterField) {
    const id = `master-${field.name}`;
    const locked = Boolean(previous?.camposSoloLectura?.includes(field.name));
    const disabled =
      busy ||
      (readOnly && field.name !== identity) ||
      (locked && field.kind === "relation");
    const required = Boolean(
      field.required &&
        !readOnly &&
        !(automatic && field.name === "Codigo" && !previous),
    );
    const value = String(record[field.name] ?? "");
    const hint =
      field.name !== identity ? (
        locked ? (
          "La serie ya fue utilizada; este dato se conserva."
        ) : (
          field.hint
        )
      ) : automatic ? (
        <>
          Código sugerido. El definitivo se confirma al guardar y puede cambiar
          si otro usuario registra un cliente antes.
          {suggestionError && (
            <div className="reference-error">
              <span role="alert">{suggestionError}</span>
              <button
                type="button"
                onClick={() => setSuggestionRevision((current) => current + 1)}
              >
                Reintentar sugerencia
              </button>
            </div>
          )}
        </>
      ) : previous && !readOnly ? (
        "El código se conserva para mantener sus relaciones."
      ) : undefined;
    const presentation = {
      id,
      label: field.label,
      required,
      invalid: Boolean(errors[field.name]),
      error: errors[field.name],
      hint,
      wide: field.kind === "textarea",
      size: field.size,
    };
    if (field.kind === "voucher")
      return (
        <NumeroComprobante
          key={field.name}
          {...presentation}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          onValueChange={(next) => change(field.name, next)}
        />
      );
    if (field.kind === "select")
      return (
        <DropDown
          key={field.name}
          {...presentation}
          value={value}
          options={[
            { value: "", label: "Seleccioná una opción" },
            ...(field.options ?? []),
          ]}
          disabled={disabled}
          onValueChange={(next) => change(field.name, next)}
        />
      );
    if (field.kind === "relation")
      return (
        <ReferenceSelect
          key={field.name}
          {...presentation}
          field={field}
          value={value}
          disabled={disabled}
          onChange={(next) => change(field.name, next)}
          onExpired={onExpired}
        />
      );
    if (field.kind === "textarea")
      return (
        <TextArea
          key={field.name}
          {...presentation}
          value={value}
          maxLength={field.maxLength}
          disabled={disabled}
          onValueChange={(next) => change(field.name, next)}
        />
      );
    return (
      <TextBox
        key={field.name}
        {...presentation}
        type={field.kind === "email" ? "email" : "text"}
        value={value}
        maxLength={field.maxLength}
        disabled={disabled}
        readOnly={
          locked ||
          (field.name === identity && (Boolean(previous) || automatic))
        }
        inputMode={field.kind === "integer" ? "numeric" : undefined}
        placeholder={
          automatic && field.name === "Codigo"
            ? suggestionLoading
              ? "Consultando código…"
              : "Código no disponible"
            : undefined
        }
        onValueChange={(next) => change(field.name, next)}
      />
    );
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
        <div
          className="form-toolbar-actions"
          role="group"
          aria-label="Acciones del formulario"
        >
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {readOnly ? "Cerrar" : "Cancelar"}
          </button>
          {!readOnly && (
            <button
              className="button primary"
              type="submit"
              form={formId}
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
      <form
        ref={form}
        id={formId}
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
                  {visibleFields
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
            {visibleFields.map((field, index) =>
              index === 0 ? (
                <div className="form-identity-row" key={field.name}>
                  {renderField(field)}
                  <div className="form-status-field">
                    <CheckBox
                      id="master-Activo"
                      label="Registro activo"
                      value={record.Activo}
                      disabled={busy || readOnly}
                      onValueChange={(next) => change("Activo", next)}
                    />
                  </div>
                </div>
              ) : (
                renderField(field)
              ),
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
