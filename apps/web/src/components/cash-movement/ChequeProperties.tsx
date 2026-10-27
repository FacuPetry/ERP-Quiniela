import { displayDate } from "../controls/date-value";
import { useCallback } from "react";
import { RecordProperties, type PropertyField } from "../ui/RecordProperties";
import { cashCheque } from "../../services/cash-movement";
import { amount } from "./format";
const fields: PropertyField<Record<string, string | null>>[] = [
  {
    key: "tipo",
    label: "Tipo",
    render: (r) => (r.Tipo === "PROPIO" ? "Propio" : "Tercero"),
  },
  { key: "numero", label: "Número", render: (r) => r.Numero },
  { key: "banco", label: "Banco", render: (r) => r.BancoNombre },
  { key: "cuenta", label: "Cuenta propia", render: (r) => r.CuentaNombre },
  {
    key: "libradora",
    label: "Cuenta libradora",
    render: (r) => r.CuentaLibradora,
  },
  { key: "librador", label: "Librador", render: (r) => r.Librador },
  { key: "documento", label: "Documento", render: (r) => r.Documento },
  { key: "emision", label: "Emisión", render: (r) => displayDate(r.Emision) },
  {
    key: "vencimiento",
    label: "Vencimiento",
    render: (r) => displayDate(r.Vencimiento),
  },
  { key: "importe", label: "Importe", render: (r) => amount(r.Importe ?? "0") },
  { key: "estado", label: "Estado", render: (r) => r.Estado },
];
export function ChequeProperties({
  id,
  onClose,
  onExpired,
}: {
  id: string;
  onClose: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => cashCheque(id, signal),
    [id],
  );
  return (
    <RecordProperties
      title="Propiedades del cheque"
      loadRecord={load}
      fields={fields}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
