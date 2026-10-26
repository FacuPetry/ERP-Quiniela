import type { ComponentPropsWithRef } from "react";
import { Field, type FieldProps } from "./Field";
import { Icon } from "../Icon";

export type CheckBoxProps = FieldProps &
  Omit<
    ComponentPropsWithRef<"input">,
    | keyof FieldProps
    | "value"
    | "defaultValue"
    | "checked"
    | "defaultChecked"
    | "onChange"
    | "type"
    | "children"
    | "readOnly"
  > & {
    value: boolean;
    onValueChange: (value: boolean) => void;
  };

/** Conserva la interacción nativa: clic en casilla/label, foco y barra espaciadora. */
export function CheckBox({
  id,
  label,
  required,
  invalid,
  error,
  hint,
  wide,
  size,
  value,
  onValueChange,
  className,
  ...input
}: CheckBoxProps) {
  return (
    <Field {...{ id, label, required, invalid, error, hint, wide, size }} inline>
      {(binding) => (
        <span className="checkbox-control">
          <input
            {...input}
            {...binding}
            className={`base-checkbox ${className ?? ""}`}
            type="checkbox"
            required={required}
            checked={value}
            onChange={(event) => onValueChange(event.currentTarget.checked)}
          />
          <Icon name="check" size={14} />
        </span>
      )}
    </Field>
  );
}
