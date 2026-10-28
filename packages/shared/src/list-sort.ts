/** Orden público de listados; null restablece la clave predeterminada ascendente. */
export interface ListSort {
  campo: string;
  direccion: "asc" | "desc";
}
export function nextListSort(
  current: ListSort | null,
  campo: string,
): ListSort | null {
  if (current?.campo !== campo) return { campo, direccion: "desc" };
  return current.direccion === "desc" ? { campo, direccion: "asc" } : null;
}
export function listSortQuery(sort: ListSort | null): Record<string, string> {
  return sort ? { orden: sort.campo, direccion: sort.direccion } : {};
}
export type SortValue = string | number | boolean | null | undefined;
export type SortType = "text" | "number" | "date";
const collator = new Intl.Collator("es-AR", { sensitivity: "base" });
function decimal(value: SortValue) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return null;
  return {
    negative: match[1] === "-",
    whole: BigInt(match[2]!),
    fraction: match[3] ?? "",
  };
}
/** Compara valores canónicos, nunca textos monetarios/fechas formateadas. */
export function compareSortValues(
  a: SortValue,
  b: SortValue,
  type: SortType = "text",
): number {
  if (type === "number") {
    const left = decimal(typeof a === "boolean" ? Number(a) : a);
    const right = decimal(typeof b === "boolean" ? Number(b) : b);
    // Históricos «Sin número» o campos vacíos se tratan como ausencia numérica.
    if (!left || !right) return !left ? (!right ? 0 : -1) : 1;
    const precision = Math.max(left.fraction.length, right.fraction.length);
    const units = (v: typeof left) =>
      (v.negative ? -1n : 1n) *
      (v.whole * 10n ** BigInt(precision) +
        BigInt(v.fraction.padEnd(precision, "0") || "0"));
    const x = units(left),
      y = units(right);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
  if (type === "date") {
    // Fechas civiles ISO o SQL ya normalizadas: no se convierten de zona horaria.
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  return collator.compare(String(a), String(b));
}
export function sortListRows<T>(
  rows: readonly T[],
  sort: ListSort | null,
  column?: {
    value: (row: T) => SortValue;
    type?: SortType;
  },
): readonly T[] {
  if (!sort || !column) return rows;
  const direction = sort.direccion === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        direction *
          compareSortValues(
            column.value(a.row),
            column.value(b.row),
            column.type,
          ) || a.index - b.index,
    )
    .map(({ row }) => row);
}
