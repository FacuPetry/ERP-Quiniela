/** BIGINT decimal: punto de venta * 10^8 + correlativo. */
export const voucherBase = 100000000n;
export const voucherMaximum = 999999999999n;
export const voucherLastCounter = 99999999n;
export function voucherNumberError(value: string): string | undefined {
  if (!/^[0-9]{1,12}$/.test(value))
    return "Ingresá un número de comprobante válido.";
  const number = BigInt(value);
  if (number > voucherMaximum || number % voucherBase === 0n)
    return "El punto de venta admite cuatro dígitos y el correlativo debe estar entre 00000001 y 99999999.";
  return undefined;
}
export function voucherParts(value: string) {
  const number = /^[0-9]{1,12}$/.test(value) ? BigInt(value) : 0n;
  return {
    point: (number / voucherBase).toString().padStart(4, "0"),
    counter: (number % voucherBase).toString().padStart(8, "0"),
  };
}
export function encodeVoucher(point: string, counter: string): string {
  if (!/^[0-9]{0,4}$/.test(point) || !/^[0-9]{0,8}$/.test(counter))
    throw new Error("Formato de comprobante inválido.");
  return (
    BigInt(point || "0") * voucherBase +
    BigInt(counter || "0")
  ).toString();
}
export function formatVoucher(value: string | null): string {
  if (value === null) return "Sin número";
  const parts = voucherParts(value);
  return parts.point + "-" + parts.counter;
}
export function nextVoucher(value: string): string | null {
  if (voucherNumberError(value))
    throw new Error("Número de comprobante inválido.");
  return BigInt(value) % voucherBase === voucherLastCounter
    ? null
    : (BigInt(value) + 1n).toString();
}
