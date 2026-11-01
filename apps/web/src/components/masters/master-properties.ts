import {
  formatVoucher,
  masterFormFields,
  type MasterDefinition,
  type MasterRecord,
} from "@erp/shared";
import { getReference as getMaster } from "../../services/masters";
import type { PropertyField } from "../ui/RecordProperties";

export interface MasterPropertiesData {
  record: MasterRecord;
  descriptions: Record<string, string>;
}
export function masterPropertyFields(
  master: MasterDefinition,
): PropertyField<MasterPropertiesData>[] {
  const available = masterFormFields(master);
  const names = master.propertyFields ?? [
    ...available.map((field) => field.name),
    "Activo",
  ];
  return [...new Set(names)].flatMap((name) => {
    if (name === "Activo")
      return [
        {
          key: name,
          label: "Estado",
          render: ({ record }: MasterPropertiesData) =>
            record.Activo ? "Activo" : "Inactivo",
        },
      ];
    const field = available.find((field) => field.name === name);
    if (!field) return []; // IDTabla y campos internos no se muestran, incluso si se configuran.
    return [
      {
        key: name,
        label: field.label,
        render: ({ record, descriptions }: MasterPropertiesData) => {
          const value = record[name];
          if (value == null || value === "") return "—";
          if (field.kind === "boolean") return value ? "Sí" : "No";
          if (field.relation) return descriptions[name] ?? String(value);
          if (field.kind === "voucher") return formatVoucher(String(value));
          return (
            field.options?.find((option) => option.value === value)?.label ??
            String(value)
          );
        },
      },
    ];
  });
}
/** Solo el detalle seleccionado y sus referencias concretas; nunca descarga maestros completos. */
export async function loadMasterProperties(
  master: MasterDefinition,
  key: string,
  signal: AbortSignal,
): Promise<MasterPropertiesData> {
  const { registro: record } = await getMaster(master.key, key, signal);
  const displayed = new Set(
    masterPropertyFields(master).map((field) => field.key),
  );
  const descriptions = Object.fromEntries(
    await Promise.all(
      masterFormFields(master)
        .filter(
          (field) =>
            displayed.has(field.name) && field.relation && record[field.name],
        )
        .map(async (field) => {
          const related = await getMaster(
            field.relation!,
            String(record[field.name]),
            signal,
          );
          return [
            field.name,
            String(
              related.registro[field.relationLabelField ?? "Descripcion"] ??
                related.registro.Nombre ??
                record[field.name],
            ),
          ];
        }),
    ),
  );
  return { record, descriptions };
}
