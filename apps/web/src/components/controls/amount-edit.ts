import {
  formatAmount,
  editAmount,
  parseAmountInput,
  type AmountFormat,
} from "./amount-value";

export interface AmountEdit {
  text: string;
  value: string;
  caret: number;
}
const zero = (config: AmountFormat) => parseAmountInput("0", config).value;
function reset(config: AmountFormat): AmountEdit {
  const value = zero(config),
    text = formatAmount(value, config);
  return { value, text, caret: Math.max(1, text.indexOf(config.decimal)) };
}
/** Confirmar edición vacía/inválida produce cero, sin cambiar el parser estricto
 * ni redondear valores. Solo se usa como respuesta a una edición del usuario. */
export function finishAmountEdit(
  text: string,
  config: AmountFormat,
  maxIntegerDigits?: number,
): AmountEdit {
  const parsed = parseAmountInput(text, config, maxIntegerDigits);
  if (parsed.error || !parsed.value) return reset(config);
  const formatted = formatAmount(parsed.value, config);
  return { text: formatted, value: parsed.value, caret: formatted.length };
}

/** Pegar un fragmento valida primero sus separadores. Así una agrupación
 * inválida o un decimal pegado en la parte entera no se convierten en miles. */
export function pasteAmountInput(
  previous: string,
  fragment: string,
  start: number,
  end: number,
  config: AmountFormat,
  maxIntegerDigits?: number,
): AmountEdit {
  if (start === 0 && end === previous.length)
    return finishAmountEdit(fragment, config, maxIntegerDigits);
  const parsed = parseAmountInput(fragment, config);
  if (parsed.error) return reset(config);
  const insertion = /^\d+$/.test(fragment)
    ? fragment
    : editAmount(parsed.value, config);
  return editAmountInput(
    previous,
    previous.slice(0, start) + insertion + previous.slice(end),
    start + insertion.length,
    config,
    maxIntegerDigits,
  );
}
function inserted(previous: string, next: string) {
  let start = 0,
    end = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  return { start, text: next.slice(start, next.length - end) };
}
function caretPosition(
  raw: string,
  caret: number,
  display: string,
  config: AmountFormat,
) {
  const decimal = raw.indexOf(config.decimal),
    visibleDecimal = display.indexOf(config.decimal);
  if (decimal >= 0 && caret > decimal)
    return Math.min(
      display.length,
      (visibleDecimal >= 0 ? visibleDecimal + 1 : display.length) +
        caret -
        decimal -
        1,
    );
  const digits = (raw.slice(0, caret).match(/\d/g) ?? []).length;
  let seen = 0,
    pos = /^[+-]/.test(display) ? 1 : 0;
  if (caret === 0) return 0;
  for (; pos < display.length && seen < digits; pos++)
    if (/\d/.test(display[pos]!)) seen++;
  return pos;
}
/** Reagrupa solo la parte entera, conserva decimales en edición y remapea el
 * cursor por dígitos. Los separadores visuales no alteran el valor numérico. */
export function editAmountInput(
  previous: string,
  next: string,
  caret: number,
  config: AmountFormat,
  maxIntegerDigits?: number,
): AmountEdit {
  if (!next.trim()) return { text: "", value: zero(config), caret: 0 };
  let raw = next;
  const change = inserted(previous, next);
  // Admite el punto del teclado decimal en locales como es-AR, conservando
  // como miles los puntos que ya formaban parte del valor mostrado.
  if (
    config.decimals > 0 &&
    config.group === "." &&
    config.decimal !== "." &&
    change.text === "."
  )
    raw =
      raw.slice(0, change.start) + config.decimal + raw.slice(change.start + 1);
  const sign = /^[+-]/.test(raw) ? raw[0]! : "";
  const unsigned = sign ? raw.slice(1) : raw;
  if (!unsigned) return { text: sign, value: zero(config), caret: sign.length };
  if (unsigned.split(config.decimal).length > 2) return reset(config);
  let [whole, fraction] = unsigned.split(config.decimal);
  const previousWhole = previous.split(config.decimal)[0] ?? "";
  if (
    fraction === undefined &&
    whole!.includes(config.group) &&
    !previousWhole.includes(config.group)
  ) {
    const strict = parseAmountInput(raw, config, maxIntegerDigits);
    if (strict.error) return reset(config);
    // Entrada completa sin agrupación válida: conservar el separador decimal
    // alternativo ya admitido por parseAmountInput, sin confundirlo con miles.
    const chunks = whole!.split(config.group);
    if (
      chunks.length === 2 &&
      !(
        chunks[0]!.length >= 1 &&
        chunks[0]!.length <= 3 &&
        chunks[1]!.length === 3
      )
    ) {
      whole = chunks[0];
      fraction = chunks[1];
      raw = sign + whole + config.decimal + fraction;
    }
  }
  whole = whole!.split(config.group).join("");
  if (
    !/^\d*$/.test(whole) ||
    (fraction !== undefined && !/^\d*$/.test(fraction))
  )
    return reset(config);
  whole = whole || "0";
  const parsed = parseAmountInput(
    sign + whole + (fraction === undefined ? "" : config.decimal + fraction),
    config,
    maxIntegerDigits,
  );
  if (parsed.error) return reset(config);
  const integer = config.grouping
    ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, config.group)
    : whole;
  const text =
    sign +
    integer +
    (fraction === undefined || config.decimals === 0
      ? ""
      : config.decimal + fraction.slice(0, config.decimals));
  return {
    text,
    value: parsed.value,
    caret: caretPosition(raw, caret, text, config),
  };
}
