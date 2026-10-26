import { useEffect, useRef, useState } from "react";
import { Field, type FieldProps } from "./Field";
import { Icon } from "../Icon";
import { formatDateValue, parseDateInput } from "./date-value";
import "./date-picker.css";
export interface DatePickerProps extends FieldProps {
  /** Valor civil ISO yyyy-MM-dd o vacío. El formato visual no cambia el contrato. */
  value: string;
  onValueChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  name?: string;
}
export function DatePicker({
  value,
  onValueChange,
  readOnly = false,
  disabled = false,
  name,
  ...field
}: DatePickerProps) {
  const [text, setText] = useState(() => formatDateValue(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) setText(formatDateValue(value));
    emitted.current = value;
  }, [value]);
  function emit(next: string) {
    emitted.current = next;
    onValueChange(next);
  }
  function finish() {
    if (readOnly || disabled) return;
    const next = parseDateInput(text);
    setText(formatDateValue(next));
    emit(next);
  }
  const label = typeof field.label === "string" ? field.label : "fecha";
  return (
    <Field {...field}>
      {(binding) => (
        <div className="control-group date-control">
          <input
            {...binding}
            className="base-control base-textbox date-text"
            type="text"
            value={text}
            placeholder="dd/MM/yyyy"
            required={field.required}
            readOnly={readOnly}
            disabled={disabled}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setText(next);
              emit(parseDateInput(next));
            }}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Enter") finish();
            }}
          />
          <span
            className="date-calendar-action"
            title={`Calendario de ${label}`}
          >
            <Icon name="calendar" size={18} />
            <input
              className="date-calendar-input"
              type="date"
              aria-label={`Calendario de ${label}`}
              aria-describedby={binding["aria-describedby"]}
              value={formatDateValue(value) ? value : ""}
              min="1000-01-01"
              max="9999-12-31"
              name={name}
              disabled={disabled || readOnly}
              onClick={(event) => {
                const calendar = event.currentTarget;
                if (typeof calendar.showPicker === "function") {
                  try {
                    calendar.showPicker();
                    event.preventDefault();
                  } catch {
                    // Mantener la acción nativa si el navegador restringe showPicker.
                  }
                }
              }}
              onChange={(event) => {
                const next = event.currentTarget.value;
                const formatted = formatDateValue(next);
                setText(formatted);
                emit(formatted ? next : "");
              }}
            />
          </span>
        </div>
      )}
    </Field>
  );
}
