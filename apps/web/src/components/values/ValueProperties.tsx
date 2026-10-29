import { useCallback } from "react";
import {
  valueStateLabel,
  valueTypeLabel,
  type ValueRecordDetail,
  type ValueRecord,
  type ValueOperation,
} from "@erp/shared";
import { valueDetail } from "../../services/values";
import { RecordProperties, type PropertyField } from "../ui/RecordProperties";
import { displayDate, displayDateTime } from "../controls/date-value";
import { amount } from "../cash-movement/format";
export const valueFields: PropertyField<ValueRecordDetail>[] = [
  {
    key: "type",
    label: "Tipo",
    render: (d) => valueTypeLabel(d.registro.Tipo),
  },
  {
    key: "number",
    label: "Número / Referencia",
    render: (d) => d.registro.Numero || "Sin referencia",
  },
  {
    key: "state",
    label: "Estado del valor",
    render: (d) => valueStateLabel(d.registro.Estado),
  },
  { key: "bank", label: "Banco", render: (d) => d.registro.BancoNombre },
  {
    key: "account",
    label: "Cuenta propia",
    render: (d) => d.registro.CuentaNombre,
  },
  {
    key: "issuerAccount",
    label: "Cuenta libradora",
    visible: (d) => d.registro.Familia === "CHEQUE",
    render: (d) => d.datos.CuentaLibradora,
  },
  {
    key: "issuer",
    label: "Librador",
    visible: (d) => d.registro.Familia === "CHEQUE",
    render: (d) => d.datos.Librador,
  },
  {
    key: "document",
    label: "Documento",
    visible: (d) => d.registro.Familia === "CHEQUE",
    render: (d) => d.datos.Documento,
  },
  {
    key: "date",
    label: "Fecha de emisión / operación",
    render: (d) => displayDate(d.registro.Fecha),
  },
  {
    key: "due",
    label: "Vencimiento",
    visible: (d) => d.registro.Familia === "CHEQUE",
    render: (d) => displayDate(d.registro.Vencimiento),
  },
  {
    key: "amount",
    label: "Importe",
    render: (d) => amount(d.registro.Importe),
  },
  {
    key: "client",
    label: "Cliente de origen",
    render: (d) => d.registro.ClienteNombre,
  },
  {
    key: "voucher",
    label: "Comprobante de origen",
    render: (d) => d.registro.ComprobanteDescripcion,
  },
  {
    key: "voucherNumber",
    label: "Número de comprobante de origen",
    render: (d) => d.registro.NumeroComprobanteTexto,
  },
  {
    key: "user",
    label: "Registrado por",
    render: (d) => d.registro.UsuarioNombre,
  },
  {
    key: "created",
    label: "Registrado el",
    render: (d) => displayDateTime(d.registro.CreadoEn),
  },
  { key: "note", label: "Observaciones", render: (d) => d.datos.Observacion },
];
export function ValueProperties({
  row,
  onClose,
  onExpired,
  onOperation,
}: {
  row: ValueRecord;
  onClose: () => void;
  onExpired: () => void;
  onOperation: (operation: ValueOperation) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => valueDetail(row.Familia, row.IDTabla, signal),
    [row.Familia, row.IDTabla],
  );
  return (
    <RecordProperties
      title="Propiedades · Valor"
      loadRecord={load}
      fields={[
        ...valueFields,
        {
          key: "operation",
          label: "Operación relacionada",
          render: (d) => {
            const op = d.operaciones.find(
              (m) => m.IDTabla === d.registro.OrigenCajaMovimiento,
            );
            return op ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => onOperation(op)}
              >
                Consultar operación de origen
              </button>
            ) : (
              "Sin operación vinculada"
            );
          },
        },
      ]}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
