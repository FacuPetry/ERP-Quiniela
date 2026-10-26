import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { encodeVoucher, voucherParts } from "@erp/shared";
import { Field, type FieldProps } from "./Field";
import "./numero-comprobante.css";
/** Dos inputs visuales, un único BIGINT decimal en el contrato. */
export function NumeroComprobante({
  value,
  onValueChange,
  readOnly = false,
  disabled = false,
  ...field
}: FieldProps & {
  value: string;
  onValueChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const [parts, setParts] = useState(() => voucherParts(value));
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    if (value !== emitted.current) setParts(voucherParts(value));
    emitted.current = null;
  }, [value]);
  const label =
    typeof field.label === "string" ? field.label : "Número de comprobante";
  function change(part: "point" | "counter", text: string) {
    if (
      readOnly ||
      disabled ||
      !/^[0-9]*$/.test(text) ||
      text.length > (part === "point" ? 4 : 8)
    )
      return;
    const next = { ...parts, [part]: text };
    setParts(next);
    emitted.current = encodeVoucher(next.point, next.counter);
    onValueChange(emitted.current);
  }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    if (readOnly || disabled) return;
    const full = /^([0-9]{4})-([0-9]{8})$/.exec(
      event.clipboardData.getData("text").trim(),
    );
    if (!full) return;
    event.preventDefault();
    const next = { point: full[1]!, counter: full[2]! };
    setParts(next);
    emitted.current = encodeVoucher(next.point, next.counter);
    onValueChange(emitted.current);
  }
  return (
    <Field {...field}>
      {(binding) => (
        <div
          className="base-control control-group voucher-control"
          role="group"
          aria-label={label}
          data-disabled={disabled || undefined}
          data-readonly={readOnly || undefined}
          aria-invalid={Boolean(field.error || field.invalid)}
        >
          <input
            {...binding}
            className="voucher-point"
            type="text"
            inputMode="numeric"
            aria-label={`${label} · Punto de venta`}
            maxLength={4}
            value={parts.point}
            readOnly={readOnly}
            disabled={disabled}
            onChange={(e) => change("point", e.target.value)}
            onFocus={(e) => {
              if (!readOnly) e.currentTarget.select();
            }}
            onBlur={() =>
              setParts((current) => ({
                ...current,
                point: current.point.padStart(4, "0"),
              }))
            }
            onPaste={paste}
          />
          <input
            className="voucher-counter"
            type="text"
            inputMode="numeric"
            aria-label={`${label} · Número`}
            aria-describedby={binding["aria-describedby"]}
            aria-invalid={binding["aria-invalid"]}
            maxLength={8}
            value={parts.counter}
            readOnly={readOnly}
            disabled={disabled}
            onChange={(e) => change("counter", e.target.value)}
            onFocus={(e) => {
              if (!readOnly) e.currentTarget.select();
            }}
            onBlur={() =>
              setParts((current) => ({
                ...current,
                counter: current.counter.padStart(8, "0"),
              }))
            }
            onPaste={paste}
          />
        </div>
      )}
    </Field>
  );
}
