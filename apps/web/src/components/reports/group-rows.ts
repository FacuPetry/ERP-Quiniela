/** Agrupa la colección completa antes de presentar un prefijo por scroll.
 * Solo marca el final real de cada grupo; nunca calcula importes en el cliente. */
export function groupReportRows<T>(
  rows: readonly T[],
  rowKey: (row: T) => string,
  groupKey: (row: T) => string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const ordered: T[] = [],
    lastRows = new Map<string, string>();
  for (const [key, group] of groups) {
    for (const row of group) ordered.push(row);
    lastRows.set(rowKey(group.at(-1)!), key);
  }
  return { rows: ordered, lastRows };
}
