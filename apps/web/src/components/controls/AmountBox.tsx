import { useEffect, useMemo, useRef, useState } from "react";
import { TextBox } from "./TextBox";
import type { FieldProps } from "./Field";
import { useNumericInitialValue } from "./useNumericInitialValue";
import { defaultNumericValue } from "./numeric-defaults";
import {
  amountFormat,
  formatAmount,
  parseAmountInput,
  editAmount,
} from "./amount-value";
export interface AmountBoxProps extends FieldProps {
  /** Decimal canónico con punto, sin miles/símbolos; vacío si no hay valor válido. */
  value?: string;
  initialValue?: string;
  onValueChange: (value: string) => void;
  format?: string;
  locale?: string;
  maxIntegerDigits?: number;
  disabled?: boolean;
  readOnly?: boolean;
}
export function AmountBox({
  value: providedValue,
  initialValue = defaultNumericValue,
  onValueChange,
  format = "#,##0.00",
  locale = "es-AR",
  maxIntegerDigits,
  disabled = false,
  readOnly = false,
  ...field
}: AmountBoxProps) {
  const value = useNumericInitialValue(
    providedValue,
    initialValue,
    onValueChange,
  );
  const config = useMemo(() => amountFormat(format, locale), [format, locale]);
  const [text, setText] = useState(() => formatAmount(value, config));
  const [message, setMessage] = useState("");
  const editing = useRef(false);
  const emitted = useRef(value),
    lastConfig = useRef(config);
  useEffect(() => {
    if (value !== emitted.current || config !== lastConfig.current) {
      setText(
        editing.current
          ? editAmount(value, config)
          : formatAmount(value, config),
      );
      setMessage("");
    }
    emitted.current = value;
    lastConfig.current = config;
  }, [value, config]);
  function emit(next: string) {
    emitted.current = next;
    onValueChange(next);
  }
  function finish(formatted: boolean) {
    if (readOnly || disabled) return;
    const parsed = parseAmountInput(text, config, maxIntegerDigits);
    setMessage(parsed.error ?? "");
    if (!parsed.error)
      setText(
        formatted
          ? formatAmount(parsed.value, config)
          : editAmount(parsed.value, config),
      );
    emit(parsed.value);
  }
  return (
    <TextBox
      {...field}
      className="amount-control"
      value={text}
      onValueChange={(next) => {
        setText(next);
        setMessage("");
        emit(parseAmountInput(next, config, maxIntegerDigits).value);
      }}
      error={message || field.error}
      disabled={disabled}
      readOnly={readOnly}
      inputMode="decimal"
      onFocus={(event) => {
        if (readOnly) return;
        editing.current = true;
        // Solo desagrupar valores ya formateados: un error visible debe poder corregirse.
        if (text === formatAmount(value, config))
          setText(editAmount(value, config));
        event.currentTarget.select();
      }}
      onPaste={(event) => {
        if (readOnly || disabled) return;
        const control = event.currentTarget;
        // Un importe completo pegado también pasa a la vista de edición sin miles.
        // Las inserciones parciales conservan la edición/selección nativa del input.
        if (
          control.selectionStart !== 0 ||
          control.selectionEnd !== text.length
        )
          return;
        const parsed = parseAmountInput(
          event.clipboardData.getData("text"),
          config,
          maxIntegerDigits,
        );
        if (parsed.error) return;
        event.preventDefault();
        const next = editAmount(parsed.value, config);
        setText(next);
        setMessage("");
        emit(parsed.value);
        requestAnimationFrame(() => {
          if (document.activeElement === control)
            control.setSelectionRange(next.length, next.length);
        });
      }}
      onBlur={() => {
        editing.current = false;
        finish(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(false);
      }}
    />
  );
}
