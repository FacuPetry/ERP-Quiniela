import { useId, type ReactNode } from "react";

import type { FieldSize } from "@erp/shared";
export type { FieldSize } from "@erp/shared";

export interface FieldProps {
  id?: string | undefined;
  label: ReactNode;
  required?: boolean | undefined;
  invalid?: boolean | undefined;
  error?: string | undefined;
  hint?: ReactNode;
  wide?: boolean | undefined;
  /** Ancho máximo del campo; se adapta al espacio disponible. */
  size?: FieldSize | undefined;
}
export interface FieldBinding {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

/** Presentación y accesibilidad común; no contiene reglas de una entidad. */
export function Field({
  id,
  label,
  required = false,
  invalid = false,
  error,
  hint,
  wide = false,
  size,
  inline = false,
  children,
}: FieldProps & {
  inline?: boolean;
  children: (binding: FieldBinding) => ReactNode;
}) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const describedBy =
    [hint ? `${controlId}-hint` : "", error ? `${controlId}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const binding: FieldBinding = {
    id: controlId,
    "aria-invalid": invalid || Boolean(error),
    "aria-describedby": describedBy,
  };
  const labelContent = (
    <>
      {label}
      {required ? " *" : ""}
    </>
  );
  return (
    <div
      className={`form-field base-field ${wide ? "wide" : ""} ${inline ? "field-inline" : ""}`}
      data-size={size}
    >
      {inline ? (
        <label htmlFor={controlId} className="field-inline-label">
          {children(binding)}
          <span>{labelContent}</span>
        </label>
      ) : (
        <>
          <label htmlFor={controlId}>{labelContent}</label>
          {children(binding)}
        </>
      )}
      {hint && (
        <div id={`${controlId}-hint`} className="field-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${controlId}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
