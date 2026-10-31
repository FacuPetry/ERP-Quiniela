import { useEffect, useId, useRef, useState } from "react";
import {
  cashStateLabel,
  valueEventLabel,
  valueStateLabel,
  type ValueRecordDetail,
  type ValueEvent,
  type ValueOperation,
  type ValueRecord,
} from "@erp/shared";
import { valueDetail } from "../../services/values";
import { ApiRequestError } from "../../services/http";
import { FormSections } from "../ui/FormSections";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { DataTable } from "../ui/DataTable";
import { ActionToolbar } from "../ui/ActionToolbar";
import { displayDate, displayDateTime } from "../controls/date-value";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";
import { amount, message } from "../cash-movement/format";
import { valueFields } from "./ValueProperties";
import "../cash-movement/cash-movement.css";
import "./values.css";

export function ValueView({
  row,
  onClose,
  onExpired,
  onOperation,
  onAccount,
}: {
  row: ValueRecord;
  onClose: () => void;
  onExpired: () => void;
  onOperation: (operation: ValueOperation) => void;
  onAccount: (id: string) => void;
}) {
  const [detail, setDetail] = useState<ValueRecordDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [historyKey, setHistoryKey] = useState<string | null>(null),
    [operationKey, setOperationKey] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    prefix = useId();
  useInitialFieldFocus(root, heading);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void valueDetail(row.Familia, row.IDTabla, request.signal)
      .then((d) => {
        if (!request.signal.aborted) {
          setDetail(d);
          setHistoryKey(null);
          setOperationKey(null);
        }
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [row.Familia, row.IDTabla, revision, onExpired]);
  const operation = (id: string | null | undefined) =>
    detail?.operaciones.find((m) => m.IDTabla === id);
  const openEvent = (e: ValueEvent) => {
    if (e.CuentaCorriente) {
      onAccount(e.CuentaCorriente);
      return;
    }
    const op = operation(e.CajaMovimiento);
    if (op) onOperation(op);
  };
  return (
    <section ref={root} className="panel record-form" aria-busy={loading}>
      <div className="form-heading">
        <h2 ref={heading} tabIndex={-1}>
          Consultar valor
        </h2>
        <FormToolbarActions
          closeAction={
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cerrar
            </button>
          }
        >
          {null}
        </FormToolbarActions>
      </div>
      <div className="form-body">
        {loading && (
          <p className="muted" role="status">
            Cargando valor…
          </p>
        )}
        {error && (
          <div>
            <p className="notice error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRevision((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        )}
        {detail && !error && !loading && (
          <FormSections
            idPrefix={prefix}
            sections={[
              {
                key: "general",
                title: "Datos generales",
                content: (
                  <dl className="properties-fields value-general-fields">
                    {valueFields
                      .filter((f) => !f.visible || f.visible(detail))
                      .map((f) => (
                        <div key={f.key} className="properties-field">
                          <dt>{f.label}</dt>
                          <dd>{f.render(detail) || "—"}</dd>
                        </div>
                      ))}
                  </dl>
                ),
              },
              {
                key: "history",
                title: "Historial",
                content: (
                  <DataTable<ValueEvent>
                    caption="Historial del valor"
                    rows={detail.historial}
                    loading={false}
                    rowKey={(e) => e.Clave}
                    rowLabel={(e) =>
                      valueEventLabel(e.Tipo) + " · " + displayDate(e.Fecha)
                    }
                    selectedKey={historyKey}
                    onSelectionChange={setHistoryKey}
                    onRowActivate={openEvent}
                    properties={{
                      fields: [
                        {
                          key: "event",
                          label: "Evento",
                          render: (e) => valueEventLabel(e.Tipo),
                        },
                        {
                          key: "date",
                          label: "Fecha",
                          render: (e) => displayDate(e.Fecha),
                        },
                        {
                          key: "registered",
                          label: "Registrado el",
                          render: (e) => displayDateTime(e.RegistradoEn),
                        },
                        {
                          key: "user",
                          label: "Usuario",
                          render: (e) => e.UsuarioNombre,
                        },
                        {
                          key: "account",
                          label: "Cuenta propia",
                          render: (e) => e.CuentaNombre,
                        },
                        {
                          key: "operation",
                          label: "Operación",
                          render: (e) => e.Operacion,
                        },
                        {
                          key: "state",
                          label: "Estado actual de la operación",
                          render: (e) =>
                            e.EstadoOperacion
                              ? valueStateLabel(e.EstadoOperacion)
                              : null,
                        },
                        {
                          key: "note",
                          label: "Observaciones",
                          render: (e) => e.Observacion,
                        },
                        {
                          key: "debt",
                          label: "Deuda generada",
                          visible: (e) => Boolean(e.CuentaCorriente),
                          render: (e) => (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() =>
                                e.CuentaCorriente &&
                                onAccount(e.CuentaCorriente)
                              }
                            >
                              {e.ComprobanteDeuda} · {e.NumeroDeuda}
                            </button>
                          ),
                        },
                        {
                          key: "debtAmount",
                          label: "Importe de la deuda",
                          visible: (e) => Boolean(e.ImporteDeuda),
                          render: (e) =>
                            e.ImporteDeuda ? amount(e.ImporteDeuda) : null,
                        },
                        {
                          key: "compensated",
                          label: "Compensado a cuenta",
                          visible: (e) => Boolean(e.CuentaCorriente),
                          render: (e) => amount(e.CompensadoACuenta ?? "0.00"),
                        },
                        {
                          key: "bankSense",
                          label: "Movimiento bancario",
                          visible: (e) => Boolean(e.SentidoBancario),
                          render: (e) =>
                            e.SentidoBancario === "INGRESO"
                              ? "Ingreso"
                              : "Egreso",
                        },
                        {
                          key: "bankAmount",
                          label: "Importe bancario",
                          visible: (e) => Boolean(e.ImporteBancario),
                          render: (e) =>
                            e.ImporteBancario
                              ? amount(e.ImporteBancario)
                              : null,
                        },
                        {
                          key: "bankDate",
                          label: "Fecha del movimiento bancario",
                          visible: (e) => Boolean(e.FechaBancaria),
                          render: (e) => displayDate(e.FechaBancaria),
                        },
                      ],
                    }}
                    toolbar={(actions) => (
                      <div className="cash-section-toolbar">
                        <h3>Historial</h3>
                        <ActionToolbar
                          labels={{ edit: "Consultar operación relacionada" }}
                          readOnly
                          selected={actions.selected}
                          busy={false}
                          filtersActive={false}
                          editDisabled={
                            !detail.historial.find(
                              (e) => e.Clave === historyKey,
                            )?.CuentaCorriente &&
                            !operation(
                              detail.historial.find(
                                (e) => e.Clave === historyKey,
                              )?.CajaMovimiento,
                            )
                          }
                          onEdit={() => {
                            const e = detail.historial.find(
                              (e) => e.Clave === historyKey,
                            );
                            if (e) openEvent(e);
                          }}
                          onProperties={actions.onProperties}
                        />
                      </div>
                    )}
                    columns={[
                      {
                        key: "event",
                        label: "Evento",
                        render: (e) => valueEventLabel(e.Tipo),
                        sort: { value: (e) => valueEventLabel(e.Tipo) },
                      },
                      {
                        key: "date",
                        label: "Fecha",
                        render: (e) => displayDate(e.Fecha),
                        sort: { value: (e) => e.Fecha, type: "date" },
                      },
                      {
                        key: "user",
                        label: "Usuario",
                        render: (e) => e.UsuarioNombre,
                        sort: { value: (e) => e.UsuarioNombre },
                      },
                      {
                        key: "account",
                        label: "Cuenta propia",
                        render: (e) => e.CuentaNombre,
                      },
                      {
                        key: "operation",
                        label: "Operación relacionada",
                        render: (e) => e.Operacion,
                      },
                      {
                        key: "note",
                        label: "Observaciones",
                        render: (e) => e.Observacion,
                      },
                    ]}
                  />
                ),
              },
              {
                key: "operations",
                title: "Operaciones relacionadas",
                content: (
                  <DataTable<ValueOperation>
                    caption="Operaciones del valor"
                    rows={detail.operaciones}
                    loading={false}
                    rowKey={(m) => m.IDTabla}
                    rowLabel={(m) =>
                      m.ComprobanteDescripcion +
                      " · " +
                      m.NumeroComprobanteTexto
                    }
                    selectedKey={operationKey}
                    onSelectionChange={setOperationKey}
                    onRowActivate={onOperation}
                    toolbar={(actions) => (
                      <div className="cash-section-toolbar">
                        <h3>Operaciones relacionadas</h3>
                        <ActionToolbar
                          labels={{ edit: "Consultar operación relacionada" }}
                          readOnly
                          selected={actions.selected}
                          busy={false}
                          filtersActive={false}
                          onEdit={() => {
                            const op = operation(operationKey);
                            if (op) onOperation(op);
                          }}
                          onProperties={actions.onProperties}
                        />
                      </div>
                    )}
                    columns={[
                      {
                        key: "voucher",
                        label: "Comprobante",
                        render: (m) => m.ComprobanteDescripcion,
                        sort: { value: (m) => m.ComprobanteDescripcion },
                      },
                      {
                        key: "number",
                        label: "Número",
                        render: (m) => m.NumeroComprobanteTexto,
                        sort: { value: (m) => m.NumeroComprobanteTexto },
                      },
                      {
                        key: "date",
                        label: "Fecha",
                        render: (m) => displayDate(m.FechaOrigen),
                        sort: { value: (m) => m.FechaOrigen, type: "date" },
                      },
                      {
                        key: "client",
                        label: "Cliente",
                        render: (m) => m.ClienteNombre,
                      },
                      {
                        key: "box",
                        label: "Caja",
                        render: (m) => m.CajaNombre,
                      },
                      {
                        key: "state",
                        label: "Estado",
                        render: (m) => cashStateLabel(m),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </div>
    </section>
  );
}
