import {
  defaultMessageTemplate,
  renderMessageTemplate,
  type BalanceMessagePreview,
} from "@erp/shared";

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
  template = defaultMessageTemplate,
  fantasy: string | null = null,
): Pick<BalanceMessagePreview, "Mensaje" | "Situacion" | "Variables"> {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(balance);
  if (!match) throw new Error("Saldo no válido para preparar el mensaje.");
  const units = BigInt(match[2]!) * 100n + BigInt(match[3]!);
  const amount = `${BigInt(match[2]!)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${match[3]}`;
  const date = until.split("-").reverse().join("/");
  const Situacion =
    units === 0n
      ? "SIN_SALDO"
      : match[1] === "-"
        ? "A_FAVOR"
        : "PENDIENTE_PAGO";
  const Variables = {
    NombreCliente: name.trim().replace(/\s+/g, " "),
    NombreFantasia: (fantasy?.trim() || name.trim()).replace(/\s+/g, " "),
    MontoTotal: `${units !== 0n && match[1] === "-" ? "-" : ""}$${amount}`,
    FechaSaldo: date,
    ResumenSaldo:
      units === 0n
        ? `tu saldo neto de Cuenta corriente al ${date} es de $0,00`
        : match[1] === "-"
          ? `al ${date} tenés un saldo a tu favor de $${amount}`
          : `tu saldo pendiente de pago al ${date} es de $${amount}`,
  };
  return {
    Situacion,
    Variables,
    Mensaje: renderMessageTemplate(template, Variables),
  };
}
