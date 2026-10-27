import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CashOpening } from "@erp/shared";
import { usePath } from "../../navigation";
import { cashOpeningStatus } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";

type Selection = Pick<CashOpening, "IDTabla" | "Caja" | "CajaNombre">;
interface ActiveCash {
  selected: Selection | null;
  select: (opening: Selection | null) => void;
  validate: (openings: CashOpening[]) => void;
}
const Context = createContext<ActiveCash | null>(null);

/** Preferencia por usuario y sesión, conservada solo en esta pestaña. Nunca autoriza un movimiento. */
export function ActiveCashProvider({
  storageKey,
  onExpired,
  children,
}: {
  storageKey: string;
  onExpired: () => void;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Selection | null>(() => {
    try {
      const value: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) ?? "null",
      );
      if (
        value &&
        typeof value === "object" &&
        "IDTabla" in value &&
        "Caja" in value &&
        "CajaNombre" in value &&
        typeof value.IDTabla === "string" &&
        /^[1-9]\d{0,18}$/.test(value.IDTabla) &&
        typeof value.Caja === "string" &&
        typeof value.CajaNombre === "string"
      )
        return value as Selection;
    } catch {
      /* Sin almacenamiento, la preferencia vive en memoria. */
    }
    return null;
  });
  const path = usePath();
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const current = useRef(selected);
  current.current = selected;
  const select = useCallback((value: Selection | null) => {
    current.current = value;
    setSelected(value);
  }, []);
  useEffect(() => {
    try {
      if (selected)
        sessionStorage.setItem(storageKey, JSON.stringify(selected));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* La aplicación sigue funcionando con almacenamiento bloqueado. */
    }
  }, [selected, storageKey]);
  const validate = useCallback(
    (openings: CashOpening[]) => {
      const previous = current.current;
      if (!previous) return;
      const found = openings.find((o) => o.IDTabla === previous.IDTabla);
      if (!found) select(null);
      else if (found.CajaNombre !== previous.CajaNombre) select(found);
    },
    [select],
  );
  const selectedId = selected?.IDTabla;
  useEffect(() => {
    if (!selectedId) return;
    let request: AbortController | undefined;
    const check = () => {
      request?.abort();
      request = new AbortController();
      const pending = request;
      void cashOpeningStatus(selectedId, pending.signal)
        .then((data) => {
          if (
            !pending.signal.aborted &&
            current.current?.IDTabla === selectedId
          ) {
            if (data.Estado !== "ABIERTO" || data.Activo !== "1") select(null);
            else if (data.CajaNombre !== current.current.CajaNombre)
              select(data);
          }
        })
        .catch((error) => {
          if (
            !pending.signal.aborted &&
            error instanceof ApiRequestError &&
            error.status === 404 &&
            current.current?.IDTabla === selectedId
          )
            select(null);
          // Un fallo de red no significa que la caja esté cerrada. El guardado siempre valida en el servidor.
          if (
            !pending.signal.aborted &&
            error instanceof ApiRequestError &&
            error.status === 401
          )
            expired.current();
        });
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      request?.abort();
      window.removeEventListener("focus", check);
    };
  }, [selectedId, path, select]);
  return (
    <Context.Provider value={{ selected, select, validate }}>
      {children}
    </Context.Provider>
  );
}
export function useActiveCash() {
  const value = useContext(Context);
  if (!value) throw new Error("Falta ActiveCashProvider.");
  return value;
}
