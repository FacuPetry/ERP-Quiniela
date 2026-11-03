import type { BalanceMessagePreview } from "@erp/shared";

/** Fecha civil del negocio; no depende de la zona horaria del servidor. */
export function messageBalanceDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
}

/** Texto independiente del canal. Conserva los decimales exactos de SQL y no
 * interpreta un saldo a favor como una deuda del destinatario. */
export function balanceMessage(
  name: string,
  balance: string,
  until: string,
): Pick<BalanceMessagePreview, "Mensaje" | "Situacion"> {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(balance);
  if (!match) throw new Error("Saldo no válido para preparar el mensaje.");
  const units = BigInt(match[2]!) * 100n + BigInt(match[3]!);
  const amount = `${BigInt(match[2]!)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${match[3]}`;
  const date = until.split("-").reverse().join("/");
  const greeting = `Hola, ${name.trim().replace(/\s+/g, " ")}. Desde la agencia de quiniela te informamos que`;
  if (units === 0n)
    return {
      Situacion: "SIN_SALDO",
      Mensaje: `${greeting} tu saldo neto de Cuenta corriente al ${date} es de $0,00. Muchas gracias.`,
    };
  if (match[1] === "-")
    return {
      Situacion: "A_FAVOR",
      Mensaje: `${greeting} al ${date} tenés un saldo a tu favor de $${amount}. Muchas gracias.`,
    };
  return {
    Situacion: "PENDIENTE_PAGO",
    Mensaje: `${greeting} tu saldo pendiente de pago al ${date} es de $${amount}. Muchas gracias.`,
  };
}
