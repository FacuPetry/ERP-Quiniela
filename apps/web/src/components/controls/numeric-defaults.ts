import type { MasterField } from "@erp/shared";

export const defaultNumericValue = "0";

/** Solo para inicializar altas; no se aplica a registros existentes ni campos limpiados. */
export function initialMasterFieldValue(
  field: MasterField,
  primaryKey: string,
) {
  if (field.kind === "boolean") return false;
  return (
    field.defaultValue ??
    (field.kind === "integer" && field.name !== primaryKey
      ? defaultNumericValue
      : "")
  );
}
