import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** Los teléfonos locales usan Argentina. No adivina el área, no acepta
 * extensiones/múltiples números y nunca modifica el teléfono del maestro. */
export function whatsappPhone(raw: string | null) {
  if (!raw?.trim())
    return {
      WhatsAppNumero: null,
      WhatsAppError:
        "El cliente no tiene teléfono configurado. Podés copiar el mensaje o completar el teléfono en Clientes.",
    };
  let text = raw.trim();
  if (text.startsWith("00")) text = "+" + text.slice(2);
  // Un internacional argentino sin '+' también es habitual en los maestros.
  const digits = text.replace(/[\s().-]/g, "");
  if (/^54\d{10,11}$/.test(digits)) text = "+" + digits;
  const phone = /^\+?[\d\s().-]+$/.test(text)
    ? parsePhoneNumberFromString(text, { defaultCountry: "AR", extract: false })
    : undefined;
  if (!phone?.isValid() || phone.ext)
    return {
      WhatsAppNumero: null,
      WhatsAppError:
        "El teléfono del cliente no tiene un formato válido. Revisalo en Clientes; para otros países incluí + y el código de país.",
    };
  return { WhatsAppNumero: phone.number.slice(1), WhatsAppError: null };
}
