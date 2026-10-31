import { useEffect, useRef, useState } from "react";
import type {
  CurrentAccountOptions,
  ChequeRejectionPreview,
  ChequeRejectionInput,
  ChequeRejectionResult,
} from "@erp/shared";
import { accountOptions } from "../../services/current-account";
import { rejectionPreview, rejectCheque } from "../../services/values";
import { ApiRequestError } from "../../services/http";
import { OffCanvas } from "../ui/OffCanvas";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import {
  DropDown,
  NumeroComprobante,
  DatePicker,
  TextBox,
  TextArea,
  CheckBox,
  useVoucherNumber,
  todayISO,
} from "../controls";
import { amount, message } from "../cash-movement/format";

export function ChequeRejection({
  id,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  id: string;
  csrf: string;
  onClose: () => void;
  onSaved: (result: ChequeRejectionResult) => void;
  onExpired: () => void;
}) {
  const [data, setData] = useState<ChequeRejectionPreview | null>(null),
    [options, setOptions] = useState<CurrentAccountOptions | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [revision, setRevision] = useState(0);
  const [voucher, setVoucher] = useState(""),
    [date, setDate] = useState(todayISO),
    [debitDate, setDebitDate] = useState(todayISO),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const saving = useRef(false),
    retry = useRef({ body: "", key: "" });
  const number = useVoucherNumber(voucher, options?.numeradores ?? []);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setLoadError("");
    void Promise.all([
      rejectionPreview(id, request.signal),
      accountOptions(request.signal),
    ])
      .then(([preview, options]) => {
        if (!request.signal.aborted) {
          setData(preview);
          setOptions(options);
          setConfirmed(false);
          setError("");
          setErrors({});
        }
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setLoadError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [id, revision, onExpired]);
  const credited = data?.Estado === "ACREDITADO";
  const vouchers =
    options?.comprobantes.filter(
      (v) => v.Cuenta === "COBRAR" && v.Naturaleza === "DEUDA",
    ) ?? [];
  async function confirm() {
    if (!data || saving.current) return;
    setError("");
    setErrors({});
    if (
      !voucher ||
      !date ||
      !reason.trim() ||
      (credited && (!confirmed || !debitDate))
    ) {
      setError(
        "Completá comprobante, fecha y motivo; si estaba acreditado, confirmá el débito bancario real.",
      );
      return;
    }
    const input: ChequeRejectionInput = {
      Comprobante: voucher,
      NumeroComprobante: number.automatic ? "0" : number.number,
      NumeroAutomatico: number.automatic,
      Fecha: date,
      Motivo: reason.trim(),
      ConfirmarDebitoBancario: Boolean(credited && confirmed),
      FechaDebito: credited ? debitDate : null,
    };
    const body = JSON.stringify({ ...input, version: data.version });
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    saving.current = true;
    setBusy(true);
    try {
      onSaved(
        await rejectCheque(id, input, data.version, csrf, retry.current.key),
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
        if (e instanceof ApiRequestError) setErrors(e.campos);
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <OffCanvas
      open
      size="md"
      title="Rechazar cheque de terceros"
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
            className="button primary"
            disabled={
              busy ||
              loading ||
              Boolean(loadError) ||
              !data ||
              !voucher ||
              (credited && !confirmed)
            }
            onClick={() => void confirm()}
          >
            {busy ? "Registrando…" : "Confirmar rechazo"}
          </button>
        </FormToolbarActions>
      }
    >
      {loading && <p role="status">Cargando datos del rechazo…</p>}
      {loadError && (
        <p className="notice error" role="alert">
          {loadError}
        </p>
      )}
      <div className="cash-inline-actions">
        <button
          className="button secondary"
          disabled={busy || loading}
          onClick={() => setRevision((n) => n + 1)}
        >
          Actualizar datos
        </button>
      </div>
      {data && !loading && !loadError && (
        <div className="cash-value-fields">
          <p className="muted small">
            Se conservará el cobro original y se generará una deuda por el
            importe del cheque. El rechazo no modifica el efectivo de caja.
          </p>
          {!vouchers.length && (
            <p className="notice">
              Configurá un comprobante de Cuenta corriente con Cobrar / Deuda /
              No aplica, por ejemplo Rechazo de cheque.
            </p>
          )}
          <div className="form-grid">
            <DropDown
              label="Comprobante"
              value={voucher}
              onValueChange={setVoucher}
              required
              options={vouchers.map((v) => ({
                value: v.Codigo,
                label: v.Descripcion,
              }))}
              disabled={busy}
              error={errors.Comprobante}
            />
            <NumeroComprobante
              label="Número de comprobante"
              value={number.number}
              onValueChange={number.onValueChange}
              hint={number.notice}
              required
              disabled={busy}
              error={errors.NumeroComprobante}
            />
            <TextBox
              label="Cheque"
              value={data.Numero}
              readOnly
              onValueChange={() => {}}
            />
            <TextBox
              label="Cliente"
              value={`${data.Cliente} - ${data.ClienteNombre}`}
              readOnly
              onValueChange={() => {}}
            />
            <TextBox
              label="Importe de la deuda"
              value={amount(data.Importe)}
              readOnly
              onValueChange={() => {}}
            />
            <DatePicker
              label="Fecha de rechazo"
              value={date}
              onValueChange={setDate}
              required
              disabled={busy}
              error={errors.Fecha}
            />
            {credited && (
              <>
                <TextBox
                  label="Cuenta del débito"
                  value={data.CuentaNombre}
                  readOnly
                  onValueChange={() => {}}
                />
                <DatePicker
                  label="Fecha del débito bancario"
                  value={debitDate}
                  onValueChange={setDebitDate}
                  required
                  disabled={busy}
                  error={errors.FechaDebito}
                />
                <CheckBox
                  label="Confirmo que el banco debitó realmente el importe completo del cheque"
                  value={confirmed}
                  onValueChange={setConfirmed}
                  disabled={busy}
                  wide
                />
              </>
            )}
            <TextArea
              label="Motivo"
              value={reason}
              onValueChange={setReason}
              required
              maxLength={500}
              wide
              disabled={busy}
              error={errors.Motivo}
            />
          </div>
          {data.CompensableACuenta !== "0.00" && (
            <p className="notice">
              Se compensarán {amount(data.CompensableACuenta)} del importe que
              todavía está a cuenta en el Recibo original.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </OffCanvas>
  );
}
