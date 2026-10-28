import { MasterRequestError } from "../masters/validation.js";

export interface ListOrderQuery {
  orden?: string | undefined;
  direccion?: "asc" | "desc" | undefined;
}
/** Solo expresiones constantes del servidor. Nunca interpolar nombres recibidos del cliente. */
export function listOrder(
  query: ListOrderQuery,
  fields: Readonly<Record<string, string>>,
  primary: string,
): string {
  if (!query.orden && !query.direccion) return primary + " ASC";
  if (
    !query.orden ||
    !Object.hasOwn(fields, query.orden) ||
    !["asc", "desc"].includes(query.direccion ?? "")
  )
    throw new MasterRequestError(
      400,
      "Seleccioná una columna y dirección de ordenamiento válidas.",
    );
  return (
    fields[query.orden] +
    (query.direccion === "asc" ? " ASC" : " DESC") +
    ", " +
    primary +
    " ASC"
  );
}
/** Las opciones provienen de los catálogos del servidor; ordenar por el texto que se muestra. */
export function optionOrder(
  field: string,
  options: readonly { value: string; label: string }[],
): string {
  const literal = (text: string) => "'" + text.replaceAll("'", "''") + "'";
  return (
    "CASE " +
    field +
    options
      .map(
        (option) =>
          " WHEN " + literal(option.value) + " THEN " + literal(option.label),
      )
      .join("") +
    " ELSE " +
    field +
    " END"
  );
}
