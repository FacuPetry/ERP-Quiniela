import { useCallback } from "react";
import type { MasterRecord } from "@erp/shared";
import { SearchField, type FieldProps } from "../controls";
import { listMasters } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
const code = (row: MasterRecord) => String(row.Codigo);
const description = (row: MasterRecord) => String(row.Nombre);
const columns = [
  { key: "Codigo", label: "Código", render: code },
  {
    key: "Nombre",
    label: "Nombre",
    render: (row: MasterRecord) => String(row.Nombre),
  },
];
export function ClientSearch({
  value,
  onChange,
  onExpired,
  historical = false,
  disabled = false,
  ...field
}: FieldProps & {
  value: MasterRecord | null;
  onChange: (value: MasterRecord | null) => void;
  onExpired: () => void;
  historical?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const search = useCallback(
    async (q: string, page: number, signal: AbortSignal) => {
      try {
        return await listMasters(
          "clientes",
          {
            q,
            pagina: String(page),
            limite: "20",
            estado: historical ? "todos" : "activo",
          },
          signal,
        );
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401)
          onExpired();
        throw error;
      }
    },
    [historical, onExpired],
  );
  return (
    <SearchField
      {...field}
      title="cliente"
      value={value}
      onValueChange={onChange}
      search={search}
      getCode={code}
      getDescription={description}
      columns={columns}
      disabled={disabled}
    />
  );
}
