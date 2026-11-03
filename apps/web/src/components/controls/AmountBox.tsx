import { useEffect, useMemo, useRef, useState } from "react";
import { TextBox } from "./TextBox";
import type { FieldProps } from "./Field";
import { useNumericInitialValue } from "./useNumericInitialValue";
import { defaultNumericValue } from "./numeric-defaults";
import { amountFormat, formatAmount } from "./amount-value";
import { draftAmountEdit, finishAmountEdit } from "./amount-edit";
import { useTabFocus } from "./useTabFocus";
export interface AmountBoxProps extends FieldProps {
  /** Decimal canónico con punto, sin miles/símbolos. La edición inválida emite cero. */
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
  const fromTab = useTabFocus();
  const emitted = useRef(value),
    lastConfig = useRef(config);
  useEffect(() => {
    if (value !== emitted.current || config !== lastConfig.current)
      setText(formatAmount(value, config));
    emitted.current = value;
    lastConfig.current = config;
  }, [value, config]);
  function emit(next: string) {
    emitted.current = next;
    onValueChange(next);
  }
  return (
    <TextBox
      {...field}
      className="amount-control"
      value={text}
      onValueChange={(next) => {
        if (readOnly || disabled) return;
        const draft = draftAmountEdit(next, config, maxIntegerDigits);
        // Conservar exactamente el texto del navegador evita mover el cursor
        // o modificar el pegado, la selección y las teclas de borrado.
        setText(draft.text);
        emit(draft.value);
      }}
      error={field.error}
      disabled={disabled}
      readOnly={readOnly}
      inputMode="decimal"
      onFocus={(event) => {
        if (!readOnly && !disabled && fromTab(event.currentTarget))
          event.currentTarget.select();
      }}
      onBlur={() => {
        if (readOnly || disabled) return;
        const result = finishAmountEdit(text, config, maxIntegerDigits);
        setText(result.text);
        emit(result.value);
      }}
    />
  );
}
