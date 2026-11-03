import {
  formatAmount,
  parseAmountInput,
  type AmountFormat,
} from "./amount-value";

export interface AmountEdit {
  text: string;
  value: string;
}

/** Conserva el borrador sin formatearlo ni intervenir en el cursor. El modelo
 * sigue siendo decimal canónico; un borrador inválido nunca emite texto ni NaN. */
export function draftAmountEdit(
  text: string,
  config: AmountFormat,
  maxIntegerDigits?: number,
): AmountEdit {
  const parsed = parseAmountInput(text, config, maxIntegerDigits);
  const value =
    parsed.error || !parsed.value
      ? parseAmountInput("0", config).value
      : parsed.value;
  return { text, value };
}

/** Solo Blur aplica la máscara y reemplaza visualmente el vacío/inválido por
 * cero. El parser conserva precisión, límites y validación de separadores. */
export function finishAmountEdit(
  text: string,
  config: AmountFormat,
  maxIntegerDigits?: number,
): AmountEdit {
  const { value } = draftAmountEdit(text, config, maxIntegerDigits);
  return { text: formatAmount(value, config), value };
}
