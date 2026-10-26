import { useEffect, useMemo, useRef, useState } from "react";
import { TextBox } from "./TextBox";
import type { FieldProps } from "./Field";
import { amountFormat, formatAmount, parseAmountInput } from "./amount-value";
export interface AmountBoxProps extends FieldProps {
  /** Decimal canónico con punto, sin miles/símbolos; vacío si no hay valor válido. */
  value: string;
  onValueChange: (value: string) => void;
  format?: string;
  locale?: string;
  maxIntegerDigits?: number;
  disabled?: boolean;
  readOnly?: boolean;
}
export function AmountBox({
  value,
  onValueChange,
  format = "#,##0.00",
  locale = "es-AR",
  maxIntegerDigits,
  disabled = false,
  readOnly = false,
  ...field
}: AmountBoxProps) {
  const config = useMemo(() => amountFormat(format, locale), [format, locale]);
  const [text, setText] = useState(() => formatAmount(value, config));
  const [message, setMessage] = useState("");
  const emitted = useRef(value),
    lastConfig = useRef(config);
  useEffect(() => {
    if (value !== emitted.current || config !== lastConfig.current) {
      setText(formatAmount(value, config));
      setMessage("");
    }
    emitted.current = value;
    lastConfig.current = config;
  }, [value, config]);
  function emit(next: string) {
    emitted.current = next;
    onValueChange(next);
  }
  function finish() {
    if (readOnly || disabled) return;
    const parsed = parseAmountInput(text, config, maxIntegerDigits);
    setMessage(parsed.error ?? "");
    if (!parsed.error) setText(formatAmount(parsed.value, config));
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
        if (!readOnly) event.currentTarget.select();
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish();
      }}
    />
  );
}
