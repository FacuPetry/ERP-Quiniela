import { formatAmount, amountFormat } from "../controls/amount-value";
export const amount = (v: string) => formatAmount(v, amountFormat());
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la operación.";
