import { useCallback } from "react";
import {
  cuentasComprobante,
  naturalezasComprobante,
  type CurrentAccountRecord,
} from "@erp/shared";
import { accountDetail } from "../../services/current-account";
import { RecordProperties, type PropertyField } from "../ui/RecordProperties";
import { formatDateValue, displayDateTime } from "../controls/date-value";
import { amountFormat, formatAmount } from "../controls/amount-value";
const money = amountFormat();
/** La configuración es del módulo; el panel no interpreta saldos ni reglas financieras. */
export const currentAccountPropertyFields: readonly PropertyField<CurrentAccountRecord>[] =
  [
    {
      key: "Comprobante",
      label: "Comprobante",
      render: (r) => r.ComprobanteDescripcion,
    },
    {
      key: "NumeroComprobante",
      label: "Número de comprobante",
      render: (r) => r.NumeroComprobanteTexto,
    },
    {
      key: "Cliente",
      label: "Cliente",
      render: (r) => `${r.Cliente} - ${r.ClienteNombre}`,
    },
    {
      key: "FechaOrigen",
      label: "Fecha de origen",
      render: (r) => formatDateValue(r.FechaOrigen),
    },
    {
      key: "Vencimiento",
      label: "Fecha de vencimiento",
      render: (r) => formatDateValue(r.Vencimiento ?? ""),
    },
    {
      key: "Concepto",
      label: "Concepto",
      render: (r) => r.ConceptoDescripcion,
    },
    {
      key: "Cuenta",
      label: "Cuenta",
      render: (r) =>
        cuentasComprobante.find((v) => v.value === r.Cuenta)?.label ?? r.Cuenta,
    },
    {
      key: "Naturaleza",
      label: "Naturaleza",
      render: (r) =>
        naturalezasComprobante.find((v) => v.value === r.Naturaleza)?.label ??
        r.Naturaleza,
    },
    {
      key: "Importe",
      label: "Importe",
      render: (r) => formatAmount(r.Importe, money),
    },
    {
      key: "Estado",
      label: "Estado",
      render: (r) =>
        r.Estado === "CONFIRMADO"
          ? "Confirmado"
          : r.Estado === "ANULADO"
            ? "Anulado"
            : r.Estado,
    },
    {
      key: "Observacion",
      label: "Observaciones",
      render: (r) => r.Observacion,
    },
    {
      key: "OrigenRegistro",
      label: "Origen del registro",
      render: (r) =>
        r.ChequeEvento
          ? "Rechazo de cheque"
          : r.CajaMovimiento
            ? "Generado desde Caja"
            : "Carga manual",
    },
    {
      key: "ChequeNumero",
      label: "Cheque rechazado",
      visible: (r) => Boolean(r.ChequeEvento),
      render: (r) => r.ChequeNumero,
    },
    {
      key: "CreadoEn",
      label: "Fecha de registro",
      render: (r) => displayDateTime(r.CreadoEn),
      visible: (r) => Boolean(r.CreadoEn),
    },
    {
      key: "AnuladoEn",
      label: "Fecha de anulación",
      render: (r) => displayDateTime(r.AnuladoEn),
      visible: (r) => r.Estado === "ANULADO",
    },
    {
      key: "MotivoAnulacion",
      label: "Motivo de anulación",
      render: (r) => r.MotivoAnulacion,
      visible: (r) => r.Estado === "ANULADO",
    },
  ];
export function CurrentAccountProperties({
  recordKey,
  onClose,
  onExpired,
}: {
  recordKey: string;
  onClose: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await accountDetail(recordKey, signal)).registro,
    [recordKey],
  );
  return (
    <RecordProperties
      title="Propiedades · Cuenta corriente"
      loadRecord={load}
      fields={currentAccountPropertyFields}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
