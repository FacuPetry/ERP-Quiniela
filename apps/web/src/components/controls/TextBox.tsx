import type { ComponentPropsWithRef } from "react";
import { Field, type FieldProps } from "./Field";
import { useNumericInitialValue } from "./useNumericInitialValue";
import { defaultNumericValue } from "./numeric-defaults";

export type TextBoxProps = FieldProps &
  Omit<
    ComponentPropsWithRef<"input">,
    | keyof FieldProps
    | "value"
    | "defaultValue"
    | "onChange"
    | "type"
    | "children"
  > & {
    type?: "text" | "email" | "password" | "search" | "tel" | "url" | "number";
    value?: string;
    /** Valor de alta para type=number; value explícito siempre tiene prioridad. */
    initialValue?: string;
    onValueChange: (value: string) => void;
  };

export function TextBox({
  id,
  label,
  required,
  invalid,
  error,
  hint,
  wide,
  size,
  value: providedValue,
  initialValue = defaultNumericValue,
  onValueChange,
  type = "text",
  className,
  ...input
}: TextBoxProps) {
  const value = useNumericInitialValue(
    providedValue,
    initialValue,
    onValueChange,
    type === "number",
  );
  return (
    <Field {...{ id, label, required, invalid, error, hint, wide, size }}>
      {(binding) => (
        <input
          {...input}
          {...binding}
          className={`base-control base-textbox ${className ?? ""}`}
          type={type}
          required={required}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
      )}
    </Field>
  );
}
