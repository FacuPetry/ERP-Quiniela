import { todayISO } from "../controls/date-value";

/** Usar en el estado inicial del módulo, no al reabrir el modal ni al limpiar. */
export function initialListFilters(
  empty: Record<string, string>,
  dateKeys: readonly string[],
  operationStateKey?: string,
  today = todayISO(),
): Record<string, string> {
  return {
    ...empty,
    ...Object.fromEntries(dateKeys.map((key) => [key, today])),
    ...(operationStateKey ? { [operationStateKey]: "CONFIRMADO" } : {}),
  };
}
