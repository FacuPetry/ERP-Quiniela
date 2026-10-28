import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  cashCorrection,
  cashStateLabel,
  moneyUnits,
  numberSuggestion,
  voucherNumberError,
  type CashDetail,
  type TreasuryInput,
} from "@erp/shared";
import {
  AmountBox,
  DatePicker,
  DropDown,
  NumeroComprobante,
  TextArea,
  TextBox,
  todayISO,
} from "../controls";
import { treasuryServices } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { FormSections } from "../ui/FormSections";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";
import { useActiveCash } from "../cash-movement/ActiveCash";
import { useCashOptions } from "../cash-movement/CashActions";
import { message } from "../cash-movement/format";

export function TreasuryForm({
  detail,
  csrf,
  canWrite,
  onClose,
  onSaved,
  onExpired,
  onCorrection,
  onRelated,
}: {
  detail?: CashDetail;
  csrf: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
  onCorrection?: (d: CashDetail) => void;
  onRelated: (id: string) => void;
}) {
  const old = detail?.registro,
    readOnly = Boolean(old),
    formId = useId();
  const { selected, validate } = useActiveCash();
  const {
    data,
    loading,
    error: optionsError,
    reload,
  } = useCashOptions(onExpired, treasuryServices);
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    retry = useRef({ body: "", key: "" });
  useInitialFieldFocus(form, heading);
  const [input, setInput] = useState<TreasuryInput>(() => ({
    Comprobante: old?.Comprobante ?? "",
    NumeroComprobante: old?.NumeroComprobante ?? "0",
    CajaSaldo: old?.CajaSaldo ?? selected?.IDTabla ?? "",
    Concepto: old?.Concepto ?? "",
    FechaOrigen: old?.FechaOrigen ?? todayISO(),
    Importe: old?.ImporteEfectivo ?? "0.00",
    Observacion: old?.Observacion ?? null,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!old && data)
      validate(
        data.aperturas.filter((o) =>
          data.cajas.some((c) => c.Codigo === o.Caja),
        ),
      );
  }, [data, old, validate]);
  useEffect(() => {
    if (!old)
      setInput((s) => ({
        ...s,
        CajaSaldo: selected?.IDTabla ?? "",
        NumeroComprobante: "0",
      }));
  }, [selected?.IDTabla, old]);
  function change<K extends keyof TreasuryInput>(
    key: K,
    value: TreasuryInput[K],
  ) {
    setInput((s) => ({ ...s, [key]: value }));
    setErrors((s) => ({ ...s, [key]: "" }));
  }
  function chooseVoucher(code: string) {
    setInput((s) => ({
      ...s,
      Comprobante: code,
      NumeroComprobante: "0",
    }));
    setErrors((s) => ({ ...s, Comprobante: "", NumeroComprobante: "" }));
  }
  const numbering = numberSuggestion(
    input.Comprobante,
    data?.numeradores ?? [],
    selected?.Caja,
    true,
  );
  const numberValue =
    !readOnly && numbering.automatic
      ? numbering.number
      : input.NumeroComprobante;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly || !canWrite) return;
    const invalid: Record<string, string> = {};
    if (!input.Comprobante) invalid.Comprobante = "Seleccioná un comprobante.";
    if (!input.CajaSaldo) invalid.CajaSaldo = "Seleccioná una caja abierta.";
    if (!input.Concepto) invalid.Concepto = "Seleccioná un concepto.";
    if (!input.FechaOrigen) invalid.FechaOrigen = "Ingresá una fecha válida.";
    const numberError = voucherNumberError(numberValue);
    if (numberError) invalid.NumeroComprobante = numberError;
    try {
      if (moneyUnits(input.Importe) <= 0n)
        invalid.Importe = "El importe debe ser mayor que cero.";
    } catch {
      invalid.Importe = "Ingresá un importe válido.";
    }
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setError("Revisá los campos indicados.");
      return;
    }
    const payload = {
      ...input,
      NumeroComprobante: numbering.automatic ? "0" : numberValue,
      NumeroAutomatico: numbering.automatic,
    };
    const body = JSON.stringify(payload);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await treasuryServices.save(payload, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
        if (e instanceof ApiRequestError) setErrors(e.campos);
      }
    } finally {
      setBusy(false);
    }
  }
  const voucher = data?.comprobantes.find(
    (v) => v.Codigo === input.Comprobante,
  );
  const sense = old?.Sentido ?? voucher?.SentidoFondos;
  const correction = old
    ? cashCorrection(old, selected?.IDTabla ?? null)
    : null;
  const canCorrect =
    old &&
    old.Estado === "CONFIRMADO" &&
    !old.CajaMovimientoOrigen &&
    !old.RevertidoPor;
  return (
    <section className="panel record-form cash-form" aria-busy={busy}>
      <div className="form-heading">
        <h2 ref={heading} tabIndex={-1}>
          {readOnly
            ? "Consultar movimiento de Tesorería"
            : "Nuevo movimiento de Tesorería"}
        </h2>
        <FormToolbarActions
          closeAction={
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              {readOnly ? "Cerrar" : "Cancelar"}
            </button>
          }
        >
          {!readOnly && canWrite && (
            <button
              className="button primary"
              type="submit"
              form={formId}
              disabled={busy || loading || !selected}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
          {canWrite && canCorrect && onCorrection && (
            <button
              type="button"
              className="button danger"
              disabled={busy || !correction}
              onClick={() => onCorrection(detail!)}
            >
              {old.JornadaEstado === "CERRADO" ? "Revertir" : "Anular"}
            </button>
          )}
        </FormToolbarActions>
      </div>
      <form
        ref={form}
        id={formId}
        noValidate
        onSubmit={(e) => {
          void save(e);
        }}
      >
        <div className="form-body">
          {(error || (!old && optionsError)) && (
            <p className="notice error" role="alert">
              {error || optionsError}
              {!old && (
                <button type="button" onClick={reload}>
                  Actualizar opciones
                </button>
              )}
            </p>
          )}
          {!old && !selected && (
            <p className="notice" role="status">
              Seleccioná una caja abierta desde el listado para registrar el
              movimiento.
            </p>
          )}
          {old?.Estado === "ANULADO" && (
            <p className="notice">Motivo de anulación: {old.MotivoAnulacion}</p>
          )}
          <FormSections
            idPrefix="treasury-form"
            sections={[
              {
                key: "general",
                title: "Datos generales",
                content: (
                  <>
                    <div className="form-grid cash-general-grid">
                      {old ? (
                        <TextBox
                          label="Comprobante"
                          size="lg"
                          value={old.ComprobanteDescripcion}
                          readOnly
                          onValueChange={() => {}}
                        />
                      ) : (
                        <DropDown
                          label="Comprobante"
                          size="lg"
                          value={input.Comprobante}
                          required
                          loading={loading}
                          disabled={busy}
                          onValueChange={chooseVoucher}
                          error={errors.Comprobante}
                          options={[
                            { value: "", label: "Seleccioná un comprobante" },
                            ...(data?.comprobantes ?? [])
                              .filter(
                                (v) =>
                                  v.Cuenta === "NOAPLICA" &&
                                  v.Naturaleza === "NOAPLICA" &&
                                  ["INGRESO", "EGRESO"].includes(
                                    v.SentidoFondos,
                                  ),
                              )
                              .map((v) => ({
                                value: v.Codigo,
                                label: v.Descripcion,
                              })),
                          ]}
                        />
                      )}
                      <div className="cash-voucher-summary">
                        <NumeroComprobante
                          label="Número de comprobante"
                          size="md"
                          value={numberValue}
                          readOnly={readOnly || numbering.automatic}
                          hint={!readOnly ? numbering.notice : undefined}
                          disabled={busy}
                          onValueChange={(v) => change("NumeroComprobante", v)}
                          error={errors.NumeroComprobante}
                        />
                        <p className="cash-box-note">
                          Caja:{" "}
                          {old?.CajaNombre ??
                            selected?.CajaNombre ??
                            "Sin caja abierta seleccionada"}
                        </p>
                        {old && (
                          <p className="cash-box-note">
                            Estado: {cashStateLabel(old)}
                          </p>
                        )}
                        {sense && (
                          <p className="cash-box-note">
                            Operación:{" "}
                            {sense === "INGRESO"
                              ? "Ingreso de efectivo"
                              : "Egreso de efectivo"}
                          </p>
                        )}
                      </div>
                      <DatePicker
                        label="Fecha de origen"
                        size="sm"
                        required
                        value={input.FechaOrigen}
                        readOnly={readOnly}
                        disabled={busy}
                        onValueChange={(v) => change("FechaOrigen", v)}
                        error={errors.FechaOrigen}
                      />
                      {old ? (
                        <TextBox
                          label="Concepto"
                          size="lg"
                          value={old.ConceptoDescripcion ?? ""}
                          readOnly
                          onValueChange={() => {}}
                        />
                      ) : (
                        <DropDown
                          label="Concepto"
                          size="lg"
                          required
                          value={input.Concepto}
                          disabled={busy}
                          loading={loading}
                          onValueChange={(v) => change("Concepto", v)}
                          error={errors.Concepto}
                          options={[
                            { value: "", label: "Seleccioná un concepto" },
                            ...(data?.conceptos ?? []).map((c) => ({
                              value: c.Codigo,
                              label: c.Descripcion,
                            })),
                          ]}
                        />
                      )}
                      <TextArea
                        label="Observaciones"
                        value={input.Observacion ?? ""}
                        maxLength={4000}
                        readOnly={readOnly}
                        disabled={busy}
                        wide
                        onValueChange={(v) => change("Observacion", v || null)}
                      />
                    </div>
                    {detail?.relacionados.original && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          onRelated(detail.relacionados.original!.IDTabla)
                        }
                      >
                        Consultar movimiento original
                      </button>
                    )}
                    {detail?.relacionados.reversion && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          onRelated(detail.relacionados.reversion!.IDTabla)
                        }
                      >
                        Consultar reversión
                      </button>
                    )}
                  </>
                ),
              },
              {
                key: "amounts",
                title: "Importes",
                content: (
                  <AmountBox
                    label="Importe"
                    size="md"
                    required
                    value={input.Importe}
                    readOnly={readOnly}
                    disabled={busy}
                    onValueChange={(v) => change("Importe", v)}
                    error={errors.Importe}
                  />
                ),
              },
            ]}
          />
        </div>
      </form>
    </section>
  );
}
