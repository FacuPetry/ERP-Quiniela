export interface AmountFormat {
  decimals: number;
  decimal: string;
  group: string;
  grouping: boolean;
}
/** La máscara usa puntuación convencional; locale determina los separadores visibles. */
export function amountFormat(
  format = "#,##0.00",
  locale = "es-AR",
): AmountFormat {
  const mask = /^(#,##0|0)(?:\.(0{1,20}))?$/.exec(format);
  if (!mask)
    throw new Error(
      "Formato de importe no admitido: usá 0 o #,##0 con hasta veinte decimales obligatorios.",
    );
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
  return {
    decimals: mask[2]?.length ?? 0,
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
    grouping: mask[1] === "#,##0",
  };
}
export interface ParsedAmount {
  value: string;
  error?: string;
}
/** Decimal exacto; nunca pasa el importe por Number, parseFloat ni redondeo binario. */
function canonical(
  text: string,
  config: AmountFormat,
  maxIntegerDigits?: number,
): ParsedAmount {
  const parts = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!parts) return { value: "", error: "Ingresá un importe válido." };
  const whole = parts[2]!.replace(/^0+(?=\d)/, "");
  const fraction = parts[3] ?? "";
  if (maxIntegerDigits && whole.length > maxIntegerDigits)
    return { value: "", error: `Hasta ${maxIntegerDigits} dígitos enteros.` };
  if (fraction.replace(/0+$/, "").length > config.decimals)
    return {
      value: "",
      error: `Ingresá un importe con hasta ${config.decimals} decimales.`,
    };
  const decimals = fraction
    .slice(0, config.decimals)
    .padEnd(config.decimals, "0");
  const sign = parts[1] === "-" && /[1-9]/.test(whole + decimals) ? "-" : "";
  return { value: sign + whole + (config.decimals ? "." + decimals : "") };
}
function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function parseAmountInput(
  text: string,
  config: AmountFormat,
  maxIntegerDigits?: number,
): ParsedAmount {
  const raw = text.trim();
  if (!raw) return { value: "" };
  const sign = /^[+-]/.test(raw) ? raw[0]! : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const grouped = new RegExp(`^\\d{1,3}(?:${escape(config.group)}\\d{3})+$`);
  let whole = unsigned,
    fraction: string | undefined;
  if (unsigned.includes(config.decimal)) {
    const parts = unsigned.split(config.decimal);
    if (parts.length !== 2)
      return { value: "", error: "Ingresá un importe válido." };
    [whole, fraction] = [parts[0]!, parts[1]!];
  } else if (unsigned.includes(config.group) && !grouped.test(unsigned)) {
    // También acepta el punto decimal habitual de la API (1000.5), sin confundir 1.000.
    const parts = unsigned.split(config.group);
    if (parts.length !== 2)
      return { value: "", error: "Ingresá un importe válido." };
    [whole, fraction] = [parts[0]!, parts[1]!];
  }
  if (whole.includes(config.group)) {
    if (!grouped.test(whole))
      return { value: "", error: "Revisá los separadores de miles." };
    whole = whole.split(config.group).join("");
  }
  return canonical(
    sign + whole + (fraction !== undefined ? "." + fraction : ""),
    config,
    maxIntegerDigits,
  );
}
export function formatAmount(value: string, config: AmountFormat): string {
  if (!value) return "";
  const normalized = canonical(value, config);
  if (normalized.error) return value;
  const [whole, fraction] = normalized.value.split(".");
  const integer = config.grouping
    ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, config.group)
    : whole!;
  return integer + (config.decimals ? config.decimal + fraction : "");
}
