import { useState } from "react";
import { listSortQuery, type ListSort } from "@erp/shared";
/** Control de orden remoto: cambiar el criterio vuelve a la primera página, sin solicitar listas aún no cargadas. */
export function useListSorting(setPage: (page: number) => void) {
  const [value, setValue] = useState<ListSort | null>(null);
  return {
    value,
    query: listSortQuery(value),
    onChange: (next: ListSort | null) => {
      setPage(1);
      setValue(next);
    },
  };
}
