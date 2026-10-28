import { displayDate } from "../controls/date-value";
import { useEffect, useId, useRef, useState } from "react";
import {
  masterDefinitions,
  cashCorrection,
  type CashOptions,
  type CashReversalPreview,
  type CashDetail,
  type CashOpening,
} from "@erp/shared";
import { ActionToolbar } from "../ui/ActionToolbar";
import { Modal } from "../ui/Modal";
import { MasterProperties } from "../masters/MasterProperties";
import { OffCanvas } from "../ui/OffCanvas";
import { DataTable } from "../ui/DataTable";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { DropDown, AmountBox, TextArea, NumeroComprobante } from "../controls";
import {
  cashServices,
  type MovementServices,
  cashOpen,
  cashClose,
} from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { useActiveCash } from "./ActiveCash";
import { TextBox, CheckBox } from "../controls";
import { amount, message } from "./format";
export function useCashOptions(
  onExpired: () => void,
  services: MovementServices = cashServices,
) {
  const [data, setData] = useState<CashOptions | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const req = new AbortController();
    setLoading(true);
    void services
      .options(req.signal)
      .then((d) => {
        if (!req.signal.aborted) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (req.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setError(message(e));
      })
      .finally(() => {
        if (!req.signal.aborted) setLoading(false);
      });
    return () => req.abort();
  }, [onExpired, revision, services]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return {
    data,
    error,
    setError,
    loading,
    reload: () => setRevision((n) => n + 1),
  };
}
export function CashBoxes({
  csrf,
  onClose,
  onChanged,
  onExpired,
}: {
  csrf: string;
  onClose: () => void;
  onChanged?: () => void;
  onExpired: () => void;
}) {
  const { data, error, setError, reload, loading } = useCashOptions(onExpired);
  const { selected, select, validate } = useActiveCash();
  useEffect(() => {
    if (data)
      validate(
        data.aperturas.filter((o) =>
          data.cajas.some((c) => c.Codigo === o.Caja),
        ),
      );
  }, [data, validate]);
  const [box, setBox] = useState(""),
    [initial, setInitial] = useState("0.00"),
    [closing, setClosing] = useState<CashOpening | null>(null),
    [counted, setCounted] = useState("0.00"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef({ body: "", key: "" });
  const operationId = useId();
  const [propertyBox, setPropertyBox] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(
    () => selected?.IDTabla ?? null,
  );
  const [changeBox, setChangeBox] = useState<CashOpening | null>(null);
  const selectedOpening = data?.aperturas.find(
    (o) => o.IDTabla === highlighted,
  );
  async function save() {
    const input = closing
      ? { SaldoContado: counted, Observacion: note || null }
      : { Caja: box, SaldoInicial: initial };
    const body = JSON.stringify({ closing: closing?.IDTabla, input });
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      if (closing) {
        await cashClose(
          closing.IDTabla,
          input as { SaldoContado: string; Observacion: string | null },
          csrf,
          retry.current.key,
        );
        if (selected?.IDTabla === closing.IDTabla) select(null);
      } else
        await cashOpen(
          input as { Caja: string; SaldoInicial: string },
          csrf,
          retry.current.key,
        );
      onChanged?.();
      setClosing(null);
      setNote("");
      setBox("");
      reload();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <OffCanvas
        open
        title="Administrar cajas"
        size="lg"
        busy={busy}
        onClose={onClose}
      >
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <section
          className="cash-box-list"
          aria-label="Listado de cajas abiertas"
        >
          <div className="cash-section-toolbar">
            <h3>Cajas abiertas</h3>
            <ActionToolbar
              labels={{
                refresh: "Actualizar listado",
                properties: "Propiedades",
              }}
              selected={Boolean(selectedOpening)}
              busy={busy}
              readOnly
              filtersActive={false}
              refreshing={loading}
              onRefresh={reload}
              onProperties={() => {
                if (selectedOpening) setPropertyBox(selectedOpening.Caja);
              }}
            />
          </div>
          <DataTable
            properties={false}
            caption="Cajas abiertas"
            rows={data?.aperturas ?? []}
            rowKey={(r) => r.IDTabla}
            loading={busy || loading}
            selectedKey={highlighted}
            onSelectionChange={setHighlighted}
            rowLabel={(o) => o.CajaNombre}
            onRowActivate={(o) => setHighlighted(o.IDTabla)}
            columns={[
              {
                key: "box",
                sort: { value: (r) => r.CajaNombre, type: "text" },
                label: "Caja",
                render: (r) => r.CajaNombre,
              },
              {
                key: "date",
                sort: { value: (r) => r.AperturaEn, type: "date" },
                label: "Apertura",
                render: (r) => displayDate(r.AperturaEn),
              },
              {
                key: "initial",
                sort: { value: (r) => r.SaldoInicial, type: "number" },
                label: "Inicial",
                render: (r) => amount(r.SaldoInicial),
              },
              {
                key: "actual",
                sort: { value: (r) => r.SaldoActual, type: "number" },
                label: "Efectivo actual",
                render: (r) => amount(r.SaldoActual),
              },
            ]}
            actions={(r) => (
              <div className="cash-box-row-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    busy ||
                    loading ||
                    selected?.IDTabla === r.IDTabla ||
                    !data?.cajas.some((c) => c.Codigo === r.Caja)
                  }
                  onClick={() => {
                    setHighlighted(r.IDTabla);
                    if (selected && selected.IDTabla !== r.IDTabla)
                      setChangeBox(r);
                    else select(r);
                  }}
                >
                  {selected?.IDTabla === r.IDTabla
                    ? "Seleccionada"
                    : "Usar caja"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy || loading}
                  onClick={() => {
                    setClosing(r);
                    setCounted(r.SaldoActual);
                    setNote("");
                  }}
                >
                  Preparar cierre
                </button>
              </div>
            )}
          />
        </section>
        {data && (
          <section className="cash-box-operation" aria-labelledby={operationId}>
            <h3 id={operationId}>
              {closing ? "Cerrar " + closing.CajaNombre : "Abrir caja"}
            </h3>
            <div className="cash-value-fields">
              {closing ? (
                <>
                  <AmountBox
                    label="Saldo teórico"
                    value={closing.SaldoActual}
                    readOnly
                    onValueChange={() => {}}
                  />
                  <AmountBox
                    label="Efectivo contado"
                    value={counted}
                    onValueChange={setCounted}
                    disabled={busy || loading}
                  />
                  <TextArea
                    label="Observación de cierre"
                    value={note}
                    onValueChange={setNote}
                    disabled={busy || loading}
                    hint="Si el contado difiere del teórico, la observación es obligatoria. La diferencia se registra sin crear ajustes automáticos."
                  />
                </>
              ) : (
                <>
                  <DropDown
                    label="Caja"
                    value={box}
                    onValueChange={setBox}
                    disabled={busy || loading}
                    options={[
                      { value: "", label: "Seleccioná una caja" },
                      ...data.cajas
                        .filter(
                          (c) =>
                            !data.aperturas.some((o) => o.Caja === c.Codigo),
                        )
                        .map((c) => ({ value: c.Codigo, label: c.Nombre })),
                    ]}
                  />
                  <AmountBox
                    label="Saldo inicial"
                    value={initial}
                    onValueChange={setInitial}
                    disabled={busy || loading}
                  />
                </>
              )}
              <FormToolbarActions
                closeAction={
                  closing ? (
                    <button
                      className="button secondary"
                      disabled={busy || loading}
                      onClick={() => setClosing(null)}
                    >
                      Cancelar cierre
                    </button>
                  ) : null
                }
              >
                <button
                  className="button primary"
                  disabled={busy || loading || (!closing && !box)}
                  onClick={() => {
                    void save();
                  }}
                >
                  {busy
                    ? "Guardando…"
                    : closing
                      ? "Confirmar cierre"
                      : "Abrir caja"}
                </button>
              </FormToolbarActions>
            </div>
          </section>
        )}
      </OffCanvas>
      {changeBox && (
        <Modal
          title="Cambiar caja seleccionada"
          busy={busy}
          lockScroll
          restoreFocus
          onClose={() => setChangeBox(null)}
        >
          <div className="modal-body">
            <p>¿Estás seguro de que querés cambiar la caja seleccionada?</p>
            <p>
              {selected?.CajaNombre} → {changeBox.CajaNombre}
            </p>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setChangeBox(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || loading}
              onClick={() => {
                const current = data?.aperturas.find(
                  (o) => o.IDTabla === changeBox.IDTabla,
                );
                if (
                  current &&
                  data?.cajas.some((c) => c.Codigo === current.Caja)
                )
                  select(current);
                else
                  setError(
                    "La caja elegida ya no está disponible. Actualizá el listado.",
                  );
                setChangeBox(null);
              }}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
      {propertyBox && (
        <MasterProperties
          master={masterDefinitions.cajas}
          recordKey={propertyBox}
          onClose={() => setPropertyBox(null)}
          onExpired={onExpired}
        />
      )}
    </>
  );
}
export function ReverseCash({
  services = cashServices,
  treasury = false,
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  services?: MovementServices;
  treasury?: boolean;
  detail: CashDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const { data, error, setError, reload } = useCashOptions(onExpired, services),
    [preview, setPreview] = useState<CashReversalPreview>(),
    [previewLoading, setPreviewLoading] = useState(true),
    [previewError, setPreviewError] = useState(""),
    [revision, setRevision] = useState(0),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef({ body: "", key: "" });
  const { selected, validate } = useActiveCash();
  useEffect(() => {
    if (data)
      validate(
        data.aperturas.filter((o) =>
          data.cajas.some((c) => c.Codigo === o.Caja),
        ),
      );
  }, [data, validate]);
  const box = data?.aperturas.some((o) => o.IDTabla === selected?.IDTabla)
    ? selected!.IDTabla
    : "";
  useEffect(() => {
    const request = new AbortController();
    setPreview(undefined);
    setPreviewLoading(true);
    setPreviewError("");
    void services
      .reversalPreview(detail.registro.IDTabla, request.signal)
      .then((result) => {
        if (!request.signal.aborted) setPreview(result);
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setPreviewError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setPreviewLoading(false);
      });
    return () => request.abort();
  }, [detail.registro.IDTabla, revision, onExpired, services]);
  function refresh() {
    reload();
    setRevision((value) => value + 1);
  }
  async function save() {
    if (busy || !preview || !box || !reason.trim()) return;
    const input = {
      CajaSaldo: box,
      Motivo: reason,
    };
    const body = JSON.stringify(input);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await services.reverse(detail, input, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <OffCanvas
      open
      title={
        treasury ? "Revertir movimiento de Tesorería" : "Revertir cobro o pago"
      }
      busy={busy}
      onClose={onClose}
      footer={
        <FormToolbarActions
          closeAction={
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
          }
        >
          <button
            className="button danger"
            disabled={
              busy ||
              previewLoading ||
              !preview ||
              !box ||
              !reason.trim() ||
              cashCorrection(detail.registro, box) !== "revertir"
            }
            onClick={() => {
              void save();
            }}
          >
            Confirmar reversión
          </button>
        </FormToolbarActions>
      }
    >
      <p>
        Se registrará una operación contraria con fecha de hoy por{" "}
        {amount(detail.registro.ImporteTotal)}. El movimiento y su cierre
        anteriores se conservarán.
      </p>
      {(error || previewError) && (
        <p className="notice error" role="alert">
          {error || previewError}{" "}
          <button onClick={refresh}>Actualizar opciones</button>
        </p>
      )}
      {data && (
        <div className="cash-value-fields">
          <DropDown
            label="Comprobante de reversión"
            value={preview?.Comprobante ?? ""}
            onValueChange={() => {}}
            readOnly
            loading={previewLoading}
            options={
              preview
                ? [
                    {
                      value: preview.Comprobante,
                      label: preview.ComprobanteDescripcion,
                    },
                  ]
                : []
            }
          />
          <NumeroComprobante
            label="Número de comprobante"
            value={preview?.NumeroComprobante ?? "0"}
            onValueChange={() => {}}
            readOnly
          />
          <TextBox
            label="Caja seleccionada"
            value={
              box
                ? selected!.CajaNombre
                : "Seleccioná una caja abierta desde el listado de Cobros y pagos."
            }
            readOnly
            onValueChange={() => {}}
          />
          <TextArea
            label="Motivo"
            required
            value={reason}
            onValueChange={setReason}
            maxLength={500}
            disabled={busy}
          />
        </div>
      )}
    </OffCanvas>
  );
}

export function AnnulCash({
  services = cashServices,
  treasury = false,
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  services?: MovementServices;
  treasury?: boolean;
  detail: CashDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const { selected } = useActiveCash();
  const [reason, setReason] = useState("");
  const [bankConfirmation, setBankConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef({ body: "", key: "" });
  const hasTransfers = detail.valores.some((v) => v.Tipo === "TRANSFERENCIA");
  const available =
    cashCorrection(detail.registro, selected?.IDTabla ?? null) === "anular";
  async function save() {
    if (
      !available ||
      busy ||
      !reason.trim() ||
      (hasTransfers && !bankConfirmation)
    )
      return;
    const input = {
      CajaSaldo: selected!.IDTabla,
      Motivo: reason.trim(),
      ConfirmarCorreccionBancaria: bankConfirmation,
    };
    const body = JSON.stringify(input);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await services.annul(detail, input, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        treasury ? "Anular movimiento de Tesorería" : "Anular cobro o pago"
      }
      busy={busy}
      onClose={onClose}
    >
      <div className="modal-body">
        <p>
          Se anulará {detail.registro.ComprobanteDescripcion}{" "}
          {detail.registro.NumeroComprobanteTexto} en su misma apertura de caja.
          Se conservará su historial
          {treasury ? "." : " y se liberarán sus afectaciones."}
        </p>
        {!available && (
          <p className="notice" role="status">
            Seleccioná la apertura original y comprobá que continúa abierta.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <TextArea
          label="Motivo de anulación"
          value={reason}
          required
          maxLength={500}
          disabled={busy}
          onValueChange={setReason}
        />
        {hasTransfers && (
          <CheckBox
            label="Confirmo que corrijo una registración errónea y que no intento deshacer una transferencia bancaria ejecutada."
            value={bankConfirmation}
            onValueChange={setBankConfirmation}
            disabled={busy}
          />
        )}
      </div>
      <div className="modal-actions">
        <FormToolbarActions
          closeAction={
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
          }
        >
          <button
            className="button danger"
            disabled={
              busy ||
              !available ||
              !reason.trim() ||
              (hasTransfers && !bankConfirmation)
            }
            onClick={() => {
              void save();
            }}
          >
            Confirmar anulación
          </button>
        </FormToolbarActions>
      </div>
    </Modal>
  );
}
