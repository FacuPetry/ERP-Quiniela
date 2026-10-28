import { useCallback, useState } from "react";
import {
  cashStateLabel,
  type CashDetail,
  type RelatedCashMovement,
} from "@erp/shared";
import {
  cashServices,
  type MovementServices,
} from "../../services/cash-movement";
import { RecordProperties, type PropertyField } from "../ui/RecordProperties";
import { displayDate, displayDateTime } from "../controls/date-value";
import { amount } from "./format";
const properties: PropertyField<CashDetail>[] = [
  {
    key: "comprobante",
    label: "Comprobante",
    render: (d) => d.registro.ComprobanteDescripcion,
  },
  {
    key: "numero",
    label: "Número",
    render: (d) => d.registro.NumeroComprobanteTexto,
  },
  {
    key: "cliente",
    label: "Cliente",
    render: (d) => d.registro.Cliente + " - " + d.registro.ClienteNombre,
  },
  {
    key: "fecha",
    label: "Fecha",
    render: (d) => displayDate(d.registro.FechaOrigen),
  },
  { key: "caja", label: "Caja", render: (d) => d.registro.CajaNombre },
  {
    key: "jornada",
    label: "Apertura de la jornada",
    render: (d) => displayDateTime(d.registro.JornadaAperturaEn),
  },
  {
    key: "usuario",
    label: "Registrado por",
    render: (d) => d.registro.UsuarioNombre,
  },
  {
    key: "anuladoEn",
    label: "Fecha de anulación",
    render: (d) => displayDateTime(d.registro.AnuladoEn),
    visible: (d) => d.registro.Estado === "ANULADO",
  },
  {
    key: "anuladoPor",
    label: "Anulado por",
    render: (d) => d.registro.AnuladoPor,
    visible: (d) => d.registro.Estado === "ANULADO",
  },
  {
    key: "motivoAnulacion",
    label: "Motivo de anulación",
    render: (d) => d.registro.MotivoAnulacion,
    visible: (d) => d.registro.Estado === "ANULADO",
  },
  {
    key: "total",
    label: "Total",
    render: (d) => amount(d.registro.ImporteTotal),
  },
  {
    key: "cash",
    label: "Efectivo",
    render: (d) => amount(d.registro.ImporteEfectivo),
  },
  {
    key: "advance",
    label: "Importe inicial a cuenta",
    render: (d) => amount(d.registro.ImporteACuenta),
  },
  {
    key: "available",
    label: "Disponible a cuenta",
    render: (d) => amount(d.registro.DisponibleACuenta),
  },
  {
    key: "state",
    label: "Estado",
    render: (d) => cashStateLabel(d.registro),
  },
  {
    key: "note",
    label: "Observaciones",
    render: (d) => d.registro.Observacion,
  },
  {
    key: "values",
    label: "Valores",
    render: (d) =>
      d.valores
        .map(
          (v) =>
            `${v.Tipo === "TRANSFERENCIA" ? "Transferencia" : v.Tipo === "PROPIO" ? "Cheque propio" : "Cheque de terceros"} · ${v.CuentaNombre ?? v.BancoNombre} · ${v.Numero} · ${amount(v.Importe)}`,
        )
        .join("\n"),
  },
];

export function CashProperties({
  services = cashServices,
  treasury = false,
  id,
  onClose,
  onExpired,
}: {
  services?: MovementServices;
  treasury?: boolean;
  id: string;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [path, setPath] = useState([id]);
  const current = path.at(-1)!;
  const load = useCallback(
    (signal: AbortSignal) => services.detail(current, signal),
    [current, services],
  );
  function navigate(target: string) {
    setPath((previous) => {
      const index = previous.indexOf(target);
      return index < 0 ? [...previous, target] : previous.slice(0, index + 1);
    });
  }
  function reference(record: RelatedCashMovement | null | undefined) {
    if (!record) return null;
    return (
      <>
        <span>
          {record.ComprobanteDescripcion} · {record.NumeroComprobanteTexto}
        </span>
        <p className="muted small">
          {displayDate(record.FechaOrigen)} · {record.CajaNombre} · Apertura{" "}
          {displayDateTime(record.JornadaAperturaEn)}
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={() => navigate(record.IDTabla)}
        >
          Consultar movimiento relacionado
        </button>
      </>
    );
  }
  const fields: PropertyField<CashDetail>[] = [
    ...(path.length > 1
      ? [
          {
            key: "volver",
            label: "Navegación",
            render: () => (
              <button
                type="button"
                className="button secondary"
                onClick={() => setPath((p) => p.slice(0, -1))}
              >
                Volver al movimiento anterior
              </button>
            ),
          },
        ]
      : []),
    ...properties.filter(
      (field) =>
        !treasury ||
        !["cliente", "advance", "available", "values"].includes(field.key),
    ),
    {
      key: "concepto",
      label: "Concepto",
      render: (d) => d.registro.ConceptoDescripcion,
    },
    {
      key: "sentido",
      label: "Operación",
      render: (d) => (d.registro.Sentido === "INGRESO" ? "Ingreso" : "Egreso"),
    },
    {
      key: "original",
      label: "Revierte a",
      visible: (d) => Boolean(d.registro.CajaMovimientoOrigen),
      render: (d) => reference(d.relacionados?.original),
    },
    {
      key: "reversion",
      label: "Revertido por",
      visible: (d) => Boolean(d.registro.RevertidoPor),
      render: (d) => reference(d.relacionados?.reversion),
    },
  ];
  return (
    <RecordProperties
      title={
        treasury ? "Propiedades · Tesorería" : "Propiedades · Cobros y pagos"
      }
      loadRecord={load}
      fields={fields}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
