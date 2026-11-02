import { todayISO } from "../controls/date-value";

/** Rango civil común para filtros: 30 días calendario, sin depender del TZ del host. */
export function initialDateRange(today = todayISO()) {
  const from = new Date(today + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: today };
}

/** Usar en el estado inicial del módulo, no al reabrir el modal ni al limpiar. */
export function initialListFilters(
  empty: Record<string, string>,
  dateKeys: readonly string[],
  operationStateKey?: string,
  today = todayISO(),
): Record<string, string> {
  const range = initialDateRange(today);
  return {
    ...empty,
    // Las parejas se reciben en orden Desde/Hasta. Una fecha aislada conserva hoy.
    ...Object.fromEntries(
      dateKeys.map((key, index) => [
        key,
        dateKeys.length === 2 && index === 0 ? range.from : range.to,
      ]),
    ),
    ...(operationStateKey ? { [operationStateKey]: "CONFIRMADO" } : {}),
  };
}
