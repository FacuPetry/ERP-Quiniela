/** Plantillas de texto plano: el catálogo central permite sumar variables sin
 * evaluar código ni reemplazar marcadores dentro de los datos del cliente. */
export const messageVariables = [
  {
    key: "NombreCliente",
    label: "Nombre del cliente",
    description: "Nombre del cliente seleccionado.",
  },
  {
    key: "NombreFantasia",
    label: "Nombre de fantasía",
    description:
      "Nombre de fantasía del cliente; si está vacío, se utiliza su nombre.",
  },
  {
    key: "MontoTotal",
    label: "Saldo total",
    description:
      "Importe con moneda y signo; negativo significa saldo a favor.",
  },
  {
    key: "FechaSaldo",
    label: "Fecha del saldo",
    description: "Fecha de corte en formato dd/MM/yyyy.",
  },
  {
    key: "ResumenSaldo",
    label: "Descripción del saldo",
    description:
      "Frase que distingue pendiente de pago, saldo a favor y saldo neto cero.",
  },
] as const;
export type MessageVariable = (typeof messageVariables)[number]["key"];
export type MessageValues = Record<MessageVariable, string>;
export const defaultMessageTemplate =
  "Hola, {NombreCliente}. Desde la agencia de quiniela te informamos que {ResumenSaldo}. Muchas gracias.";
export const maxMessageTemplateLength = 2000;
export const maxRenderedMessageLength = 6000;

export function messageTemplateProblem(template: string): string | undefined {
  if (!template.trim()) return "Ingresá el texto del mensaje.";
  if (template.length > maxMessageTemplateLength)
    return `El mensaje admite hasta ${maxMessageTemplateLength} caracteres.`;
  const known = new Set<string>(messageVariables.map((v) => v.key));
  let problem: string | undefined;
  const rest = template.replace(/\{([^{}]*)\}/g, (_token, key: string) => {
    if (!known.has(key)) problem ??= `La variable {${key}} no está disponible.`;
    return "";
  });
  if (problem) return problem;
  if (/[{}]/.test(rest))
    return "Revisá las llaves de las variables del mensaje.";
  return undefined;
}
export function renderMessageTemplate(
  template: string,
  values: MessageValues,
): string {
  const problem = messageTemplateProblem(template);
  if (problem) throw new Error(problem);
  const text = template.replace(
    /\{([^{}]*)\}/g,
    (_token, key: MessageVariable) => values[key],
  );
  if (text.length > maxRenderedMessageLength)
    throw new Error(
      "El mensaje generado es demasiado largo. Reducí el texto o la cantidad de variables.",
    );
  return text;
}
export function whatsappMessageUrl(
  number: string | null,
  message: string,
): string | null {
  if (!number || !/^[1-9]\d{7,14}$/.test(number) || !message.trim())
    return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export interface MessageTemplatePreference {
  Plantilla: string | null;
  version: string;
}
/** Preparar, copiar o abrir un chat no constituye confirmación de envío. */
export interface BalanceMessagePreview {
  Cliente: string;
  ClienteNombre: string;
  FechaHasta: string;
  SaldoTotal: string;
  Situacion: "PENDIENTE_PAGO" | "A_FAVOR" | "SIN_SALDO";
  Mensaje: string;
  Variables: MessageValues;
  Telefono: string | null;
  WhatsAppNumero: string | null;
  WhatsAppError: string | null;
  consultadoEn: string;
}
export const messageBalanceFilters = [
  { value: "POSITIVO", label: "A pagar por el cliente (neto positivo)" },
  { value: "NO_CERO", label: "Saldo neto distinto de cero" },
  { value: "A_FAVOR", label: "A favor del cliente (neto negativo)" },
  { value: "CERO", label: "Saldo neto en cero" },
  { value: "TODOS", label: "Todos los saldos" },
] as const;
export const maxSelectedMessageClients = 1000;
export interface ClientMessageRow extends BalanceMessagePreview {
  ErrorMensaje: string | null;
}
export interface ClientMessagesResult {
  registros: ClientMessageRow[];
  total: number;
  pagina: number;
  limite: number;
  FechaHasta: string;
  consultadoEn: string;
}
