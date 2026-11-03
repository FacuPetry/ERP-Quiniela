import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TextBox } from "./TextBox";
import type { FieldProps } from "./Field";
import { useNumericInitialValue } from "./useNumericInitialValue";
import { defaultNumericValue } from "./numeric-defaults";
import { amountFormat, formatAmount } from "./amount-value";
import {
  editAmountInput,
  finishAmountEdit,
  pasteAmountInput,
  type AmountEdit,
} from "./amount-edit";
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
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<AmountEdit | null>(null);
  const fromTab = useTabFocus();
  const emitted = useRef(value),
    lastConfig = useRef(config);
  useEffect(() => {
    if (value !== emitted.current || config !== lastConfig.current) {
      selection.current = null;
      setText(formatAmount(value, config));
    }
    emitted.current = value;
    lastConfig.current = config;
  }, [value, config]);
  function emit(next: string) {
    emitted.current = next;
    onValueChange(next);
  }
  function restoreCaret() {
    const pending = selection.current,
      control = input.current;
    if (
      pending &&
      control &&
      document.activeElement === control &&
      control.value === pending.text
    ) {
      control.setSelectionRange(pending.caret, pending.caret);
      selection.current = null;
    }
  }
  useLayoutEffect(restoreCaret);
  function apply(next: AmountEdit, keepCaret = true) {
    selection.current = keepCaret ? next : null;
    setText(next.text);
    emit(next.value);
    // También restaura cuando el cero ya era el estado anterior y React no
    // necesita renderizar otra vez; nunca aplica un cursor de una edición vieja.
    if (keepCaret)
      requestAnimationFrame(() => {
        if (selection.current === next) restoreCaret();
      });
  }
  function finish() {
    if (readOnly || disabled) return;
    apply(finishAmountEdit(text, config, maxIntegerDigits), false);
  }
  return (
    <TextBox
      {...field}
      className="amount-control"
      ref={input}
      value={text}
      onValueChange={(next) => {
        if (readOnly || disabled) return;
        apply(
          editAmountInput(
            text,
            next,
            input.current?.selectionStart ?? next.length,
            config,
            maxIntegerDigits,
          ),
        );
      }}
      error={field.error}
      disabled={disabled}
      readOnly={readOnly}
      inputMode="decimal"
      onFocus={(event) => {
        if (!readOnly && !disabled && fromTab(event.currentTarget))
          event.currentTarget.select();
      }}
      onPointerDown={() => {
        selection.current = null;
      }}
      onPaste={(event) => {
        if (readOnly || disabled) return;
        const control = event.currentTarget;
        event.preventDefault();
        apply(
          pasteAmountInput(
            text,
            event.clipboardData.getData("text"),
            control.selectionStart ?? 0,
            control.selectionEnd ?? 0,
            config,
            maxIntegerDigits,
          ),
        );
      }}
      onBlur={() => {
        finish();
      }}
      onKeyDown={(event) => {
        if (readOnly || disabled) return;
        selection.current = null;
        if (event.key === "Enter") finish();
        const control = event.currentTarget,
          start = control.selectionStart ?? 0,
          end = control.selectionEnd ?? start;
        if (start !== end) return;
        // Atravesar un separador de miles no debe consumir una pulsación sin
        // borrar un dígito ni dejar el cursor atrapado en el mismo lugar.
        if (
          event.key === "Backspace" &&
          start > 1 &&
          text[start - 1] === config.group
        ) {
          event.preventDefault();
          const next = text.slice(0, start - 2) + text.slice(start);
          apply(
            editAmountInput(text, next, start - 2, config, maxIntegerDigits),
          );
        } else if (
          event.key === "Delete" &&
          text[start] === config.group &&
          /\d/.test(text[start + 1] ?? "")
        ) {
          event.preventDefault();
          const next = text.slice(0, start) + text.slice(start + 2);
          apply(editAmountInput(text, next, start, config, maxIntegerDigits));
        }
      }}
    />
  );
}
