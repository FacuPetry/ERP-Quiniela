import { useEffect, useId, useRef, useState } from "react";
import {
  moneyUnits,
  moneyText,
  type CashInput,
  type CashDetail,
  type CashOptions,
  type AllocationDetail,
  type MasterRecord,
} from "@erp/shared";
import {
  TextBox,
  DropDown,
  DatePicker,
  TextArea,
  AmountBox,
  NumeroComprobante,
  todayISO,
} from "../controls";
import { ClientSearch } from "../current-account/ClientSearch";
import { ChequeProperties } from "./ChequeProperties";
import { useActiveCash } from "./ActiveCash";
import { ActionToolbar } from "../ui/ActionToolbar";
import { FormSections } from "../ui/FormSections";
import { DataTable } from "../ui/DataTable";
import { Modal } from "../ui/Modal";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";
import { cashOptions, cashSave } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { AllocationPicker } from "./AllocationPicker";
import { ValueEditor, PortfolioPicker, type DraftValue } from "./Values";
import { amount, message } from "./format";
const emptyOptions: CashOptions = {
  comprobantes: [],
  numeradores: [],
  cajas: [],
  aperturas: [],
  cuentas: [],
  bancos: [],
  conceptos: [],
};
export function CashForm({
  detail,
  csrf,
  canWrite,
  onClose,
  onSaved,
  onExpired,
  onReverse,
  onRelated,
}: {
  detail?: CashDetail;
  csrf: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
  onReverse?: (d: CashDetail) => void;
  onRelated: (id: string) => void;
}) {
  const { selected: activeBox, validate: validateBox } = useActiveCash();
  const old = detail?.registro,
    readOnly = Boolean(old),
    formId = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    form = useRef<HTMLFormElement>(null),
    retry = useRef({ body: "", key: "" });
  useInitialFieldFocus(form, heading);
  const [input, setInput] = useState(() => ({
    Comprobante: old?.Comprobante ?? "",
    NumeroComprobante: old?.NumeroComprobante ?? "0",
    Cliente: old?.Cliente ?? "",
    FechaOrigen: old?.FechaOrigen ?? todayISO(),
    CajaSaldo: old?.CajaSaldo ?? activeBox?.IDTabla ?? "",
    Concepto: old?.Concepto ?? null,
    ImporteEfectivo: old?.ImporteEfectivo ?? "0.00",
    ImporteACuenta: old?.ImporteACuenta ?? "0.00",
    Observacion: old?.Observacion ?? null,
  }));
  const [client, setClient] = useState<MasterRecord | null>(null),
    [allocations, setAllocations] = useState<AllocationDetail[]>(
      detail?.afectaciones ?? [],
    ),
    [values, setValues] = useState<DraftValue[]>([]),
    [options, setOptions] = useState(emptyOptions),
    [loading, setLoading] = useState(!old),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false),
    [portfolio, setPortfolio] = useState(false),
    [editor, setEditor] = useState<number | null>(null),
    [selectedAllocation, setSelectedAllocation] = useState<string | null>(null),
    [selectedValue, setSelectedValue] = useState<string | null>(null),
    [changePending, setChangePending] = useState<null | (() => void)>(null),
    [clientRevision, setClientRevision] = useState(0),
    [consultingCheque, setConsultingCheque] = useState<string | null>(null);
  useEffect(() => {
    if (old) return;
    const request = new AbortController();
    setLoading(true);
    void cashOptions(request.signal)
      .then((d) => {
        if (!request.signal.aborted) {
          setOptions(d);
          validateBox(
            d.aperturas.filter((o) => d.cajas.some((c) => c.Codigo === o.Caja)),
          );
          setInput((current) =>
            current.CajaSaldo &&
            !d.aperturas.some((o) => o.IDTabla === current.CajaSaldo)
              ? { ...current, CajaSaldo: "" }
              : current,
          );
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
  }, [old, revision, onExpired, validateBox]);
  useEffect(() => {
    if (old) return;
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [old]);
  useEffect(() => {
    if (!old) setInput((s) => ({ ...s, CajaSaldo: activeBox?.IDTabla ?? "" }));
  }, [old, activeBox?.IDTabla]);
  const voucher = options.comprobantes.find(
      (c) => c.Codigo === input.Comprobante,
    ),
    sense = voucher?.SentidoFondos ?? old?.Sentido ?? "",
    compatible = options.comprobantes.filter(
      (c) =>
        c.Naturaleza === "CREDITO" &&
        ((c.Cuenta === "COBRAR" && c.SentidoFondos === "INGRESO") ||
          (c.Cuenta === "PAGAR" && c.SentidoFondos === "EGRESO")),
    );
  function change<K extends keyof typeof input>(
    key: K,
    value: (typeof input)[K],
  ) {
    setInput((s) => ({ ...s, [key]: value }));
  }
  function requestChange(commit: () => void) {
    if (allocations.length || input.ImporteACuenta !== "0.00") {
      setChangePending(() => commit);
    } else commit();
  }
  function chooseVoucher(value: string) {
    const next = options.comprobantes.find((c) => c.Codigo === value);
    const commit = () => {
      if (
        next?.Cuenta !== voucher?.Cuenta ||
        next?.SentidoFondos !== voucher?.SentidoFondos
      ) {
        setAllocations([]);
        setValues([]);
        setInput((s) => ({ ...s, ImporteACuenta: "0.00" }));
      }
      setInput((s) => ({
        ...s,
        Comprobante: value,
        NumeroComprobante:
          options.numeradores.find((n) => n.Comprobante === value)
            ?.ProximoNumero ?? "0",
      }));
    };
    if (values.length && next?.SentidoFondos !== sense)
      setChangePending(() => commit);
    else if (next?.Cuenta !== voucher?.Cuenta) requestChange(commit);
    else commit();
  }
  const displayedValues = old
    ? detail!.valores.map((v, i) => ({
        key: String(i),
        type: v.Tipo,
        bank: v.CuentaNombre ?? v.BancoNombre,
        number: v.Numero,
        amount: v.Importe,
      }))
    : values.map((v, i) => ({
        key: String(i),
        type: v.input.Tipo,
        bank: v.bank,
        number: v.number,
        amount: v.amount,
      }));
  const selectedDraft =
    selectedValue === null ? undefined : values[Number(selectedValue)]?.input;
  const selectedExisting =
    selectedValue === null ? undefined : detail?.valores[Number(selectedValue)];
  const selectedChequeId = old
    ? selectedExisting?.Tipo !== "TRANSFERENCIA"
      ? selectedExisting?.IDTabla
      : undefined
    : selectedDraft?.Tipo === "CARTERA"
      ? selectedDraft.Cheque
      : undefined;
  let applied = "0.00",
    own = "0.00",
    third = "0.00",
    net = "0.00",
    media = "0.00",
    difference = "0.00",
    invalid = false;
  try {
    applied = old
      ? moneyText(moneyUnits(old.ImporteTotal) - moneyUnits(old.ImporteACuenta))
      : moneyText(allocations.reduce((s, a) => s + moneyUnits(a.Importe), 0n));
    own = moneyText(
      displayedValues
        .filter((v) => v.type === "TRANSFERENCIA" || v.type === "PROPIO")
        .reduce((s, v) => s + moneyUnits(v.amount), 0n),
    );
    third = moneyText(
      displayedValues
        .filter((v) => v.type === "CARTERA" || v.type === "TERCERO")
        .reduce((s, v) => s + moneyUnits(v.amount), 0n),
    );
    net =
      old?.ImporteTotal ??
      moneyText(moneyUnits(applied) + moneyUnits(input.ImporteACuenta));
    media = moneyText(
      moneyUnits(input.ImporteEfectivo) + moneyUnits(own) + moneyUnits(third),
    );
    difference = moneyText(moneyUnits(media) - moneyUnits(net));
  } catch {
    invalid = true;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || busy) return;
    setError("");
    if (!client || !input.Comprobante || !input.CajaSaldo) {
      setError("Seleccioná comprobante, cliente y caja abierta.");
      document
        .getElementById(formId + "-general")
        ?.scrollIntoView({ block: "start" });
      return;
    }
    if (invalid || difference !== "0.00") {
      setError(
        "Completá los importes: los medios de pago deben coincidir con el Neto.",
      );
      return;
    }
    const payload: CashInput = {
      ...input,
      Cliente: String(client.Codigo),
      Afectaciones: allocations.map((a) => ({
        CuentaCorriente: a.CuentaCorriente,
        Importe: a.Importe,
      })),
      Valores: values.map((v) => v.input),
    };
    const body = JSON.stringify(payload);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    try {
      await cashSave(payload, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setRevision((n) => n + 1);
        setError(
          message(e) +
            (e instanceof ApiRequestError && Object.keys(e.campos).length
              ? " " + Object.values(e.campos).join(" ")
              : ""),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel record-form cash-form" aria-busy={busy}>
      <div className="form-heading">
        <h2 ref={heading} tabIndex={-1}>
          {old ? "Consultar cobro o pago" : "Nuevo cobro o pago"}
        </h2>
        <FormToolbarActions
          closeAction={
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              {old ? "Cerrar" : "Cancelar"}
            </button>
          }
        >
          {!old ? (
            <button
              className="button primary"
              form={formId}
              disabled={busy || loading || !input.CajaSaldo}
              type="submit"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          ) : (
            canWrite &&
            !old.RevertidoPor &&
            !old.CajaMovimientoOrigen && (
              <button
                className="button danger"
                onClick={() => onReverse?.(detail!)}
              >
                Revertir
              </button>
            )
          )}
        </FormToolbarActions>
      </div>
      <form
        ref={form}
        id={formId}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <fieldset
          className="form-body cash-fields"
          disabled={busy}
          aria-label="Datos del movimiento"
        >
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {!old && options === emptyOptions && !loading && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setRevision((n) => n + 1)}
            >
              Reintentar opciones
            </button>
          )}
          {old && (old.RevertidoPor || old.CajaMovimientoOrigen) && (
            <p className="notice">
              {old.RevertidoPor
                ? "Este movimiento fue revertido."
                : "Este movimiento es una reversión."}{" "}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  onRelated((old.RevertidoPor ?? old.CajaMovimientoOrigen)!)
                }
              >
                Consultar movimiento relacionado
              </button>
            </p>
          )}
          <FormSections
            idPrefix={formId}
            sections={[
              {
                key: "general",
                title: "Datos generales",
                content: (
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
                        required
                        value={input.Comprobante}
                        loading={loading}
                        disabled={busy}
                        onValueChange={chooseVoucher}
                        options={[
                          { value: "", label: "Seleccioná un comprobante" },
                          ...compatible.map((c) => ({
                            value: c.Codigo,
                            label: c.Descripcion,
                          })),
                        ]}
                      />
                    )}
                    <div className="cash-voucher-summary">
                      <NumeroComprobante
                        label="Número de comprobante"
                        value={input.NumeroComprobante}
                        onValueChange={(v) => change("NumeroComprobante", v)}
                        readOnly={readOnly}
                        disabled={busy}
                        size="md"
                      />
                      <p className="cash-box-note" role="status">
                        Caja:{" "}
                        {old?.CajaNombre ??
                          (input.CajaSaldo && activeBox
                            ? activeBox.CajaNombre
                            : "Sin caja abierta seleccionada")}
                      </p>
                    </div>
                    {old ? (
                      <TextBox
                        label="Cliente"
                        size="lg"
                        value={old.Cliente + " - " + old.ClienteNombre}
                        readOnly
                        onValueChange={() => {}}
                      />
                    ) : (
                      <ClientSearch
                        key={clientRevision}
                        label="Cliente"
                        required
                        size="lg"
                        value={client}
                        onChange={(value) =>
                          requestChange(() => {
                            setClient(value);
                            setAllocations([]);
                            change("ImporteACuenta", "0.00");
                          })
                        }
                        onExpired={onExpired}
                        disabled={busy}
                      />
                    )}
                    <DatePicker
                      label="Fecha de origen"
                      size="sm"
                      value={input.FechaOrigen}
                      onValueChange={(v) => change("FechaOrigen", v)}
                      readOnly={readOnly}
                      disabled={busy}
                    />
                    {old ? (
                      <TextBox
                        label="Concepto"
                        value={old.ConceptoDescripcion ?? ""}
                        readOnly
                        onValueChange={() => {}}
                      />
                    ) : (
                      <DropDown
                        label="Concepto"
                        value={input.Concepto ?? ""}
                        onValueChange={(v) => change("Concepto", v || null)}
                        disabled={busy}
                        options={[
                          { value: "", label: "Sin concepto" },
                          ...options.conceptos.map((c) => ({
                            value: c.Codigo,
                            label: c.Descripcion,
                          })),
                        ]}
                      />
                    )}
                    <TextArea
                      label="Observaciones"
                      wide
                      value={input.Observacion ?? ""}
                      onValueChange={(v) => change("Observacion", v || null)}
                      readOnly={readOnly}
                      disabled={busy}
                      maxLength={4000}
                    />
                    {!old && !loading && !input.CajaSaldo && (
                      <p className="notice" role="status">
                        No hay una caja abierta seleccionada. Volvé al listado y
                        elegí una desde Administrar caja.
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: "allocations",
                title: "Afectaciones",
                content: (
                  <>
                    <div className="cash-section-toolbar">
                      <h3>Afectaciones</h3>
                      {!old && (
                        <ActionToolbar
                          labels={{ remove: "Quitar afectación" }}
                          selected={Boolean(selectedAllocation)}
                          busy={busy}
                          readOnly={false}
                          filtersActive={false}
                          onDelete={() => {
                            setAllocations((rows) =>
                              rows.filter(
                                (a) => a.CuentaCorriente !== selectedAllocation,
                              ),
                            );
                            setSelectedAllocation(null);
                          }}
                          endActions={[
                            {
                              key: "affect",
                              label: "Afectar",
                              icon: "plus",
                              showLabel: true,
                              disabled: !client || !voucher,
                              onClick: () => setPicker(true),
                            },
                          ]}
                        />
                      )}
                    </div>
                    <DataTable
                      caption="Afectaciones del movimiento"
                      rows={allocations}
                      rowKey={(a) => a.CuentaCorriente}
                      rowLabel={(a) => a.NumeroComprobanteTexto}
                      loading={false}
                      selectedKey={selectedAllocation}
                      onSelectionChange={setSelectedAllocation}
                      columns={[
                        {
                          key: "number",
                          label: "Comprobante",
                          render: (a) => (
                            <>
                              {a.ComprobanteDescripcion}
                              <br />
                              {a.NumeroComprobanteTexto}
                            </>
                          ),
                        },
                        {
                          key: "original",
                          label: "Original",
                          render: (a) => amount(a.ImporteOriginal),
                        },
                        {
                          key: "pending",
                          label: old
                            ? "Pendiente actual"
                            : "Pendiente consultado",
                          render: (a) => amount(a.Pendiente),
                        },
                        {
                          key: "amount",
                          label: "Afectado",
                          render: (a) => amount(a.Importe),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: "values",
                title: "Valores",
                content: (
                  <>
                    <div className="cash-section-toolbar">
                      <h3>Valores</h3>
                      <ActionToolbar
                        labels={{
                          add: "Agregar valor",
                          edit: "Modificar valor",
                          remove: "Eliminar valor",
                        }}
                        selected={selectedValue !== null}
                        busy={busy}
                        readOnly={readOnly}
                        filtersActive={false}
                        {...(!old
                          ? {
                              onAdd: () => setEditor(-1),
                              addDisabled: !voucher,
                              onEdit: () => setEditor(Number(selectedValue)),
                              editDisabled:
                                values[Number(selectedValue)]?.input.Tipo ===
                                "CARTERA",
                              onDelete: () => {
                                setValues((s) =>
                                  s.filter(
                                    (_, i) => String(i) !== selectedValue,
                                  ),
                                );
                                setSelectedValue(null);
                              },
                            }
                          : {})}
                        endActions={[
                          ...(!old
                            ? [
                                {
                                  key: "portfolio",
                                  label: "Seleccionar de cartera",
                                  icon: "values" as const,
                                  showLabel: true,
                                  disabled: sense !== "EGRESO",
                                  onClick: () => setPortfolio(true),
                                },
                              ]
                            : []),
                          {
                            key: "cheque",
                            label: "Consultar cheque",
                            icon: "eye",
                            disabled: !selectedChequeId,
                            onClick: () => {
                              if (selectedChequeId)
                                setConsultingCheque(selectedChequeId);
                            },
                          },
                        ]}
                      />
                    </div>
                    <DataTable
                      caption="Valores del movimiento"
                      rows={displayedValues}
                      rowKey={(v) => v.key}
                      rowLabel={(v) => v.number || v.bank}
                      loading={false}
                      selectedKey={selectedValue}
                      onSelectionChange={setSelectedValue}
                      columns={[
                        {
                          key: "type",
                          label: "Tipo",
                          render: (v) =>
                            v.type === "TRANSFERENCIA"
                              ? "Transferencia"
                              : v.type === "PROPIO"
                                ? "Cheque propio"
                                : "Cheque de terceros",
                        },
                        {
                          key: "bank",
                          label: "Banco / Cuenta",
                          render: (v) => v.bank,
                        },
                        {
                          key: "number",
                          label: "Número / Referencia",
                          render: (v) => v.number || "—",
                        },
                        {
                          key: "amount",
                          label: "Importe",
                          render: (v) => amount(v.amount),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: "amounts",
                title: "Importes",
                content: (
                  <fieldset className="cash-amounts">
                    <legend>Importes</legend>
                    <div>
                      <h3>Medios de pago</h3>
                      <AmountBox
                        label="Efectivo"
                        value={input.ImporteEfectivo}
                        onValueChange={(v) => change("ImporteEfectivo", v)}
                        readOnly={readOnly}
                        disabled={busy}
                        maxIntegerDigits={16}
                      />
                      <AmountBox
                        label="Propios / Transferencias"
                        value={own}
                        readOnly
                        onValueChange={() => {}}
                      />
                      <AmountBox
                        label="Valores de terceros"
                        value={third}
                        readOnly
                        onValueChange={() => {}}
                      />
                    </div>
                    <div>
                      <h3>Aplicación</h3>
                      <AmountBox
                        label={
                          old?.CajaMovimientoOrigen
                            ? "Importe revertido"
                            : "Importe a cobrar/pagar"
                        }
                        value={applied}
                        readOnly
                        onValueChange={() => {}}
                      />
                      <AmountBox
                        label={
                          sense === "EGRESO"
                            ? "Anticipo entregado"
                            : "Adelanto recibido"
                        }
                        value={input.ImporteACuenta}
                        readOnly={readOnly}
                        disabled={busy}
                        maxIntegerDigits={16}
                        onValueChange={(v) => change("ImporteACuenta", v)}
                      />
                      <AmountBox
                        label="Neto"
                        value={net}
                        readOnly
                        onValueChange={() => {}}
                      />
                      {!old && (
                        <p className="cash-total" role="status">
                          {invalid
                            ? "Completá los importes."
                            : difference === "0.00"
                              ? "Importes coincidentes."
                              : "Diferencia por completar: " +
                                amount(difference)}
                        </p>
                      )}
                    </div>
                  </fieldset>
                ),
              },
            ]}
          />
        </fieldset>
      </form>
      {picker && client && voucher && (
        <AllocationPicker
          client={String(client.Codigo)}
          voucher={voucher.Codigo}
          initial={allocations}
          onClose={() => setPicker(false)}
          onExpired={onExpired}
          onConfirm={(rows) => {
            setAllocations((current) => [...current, ...rows]);
            setPicker(false);
          }}
        />
      )}
      {portfolio && (
        <PortfolioPicker
          initial={values}
          onClose={() => setPortfolio(false)}
          onExpired={onExpired}
          onConfirm={(rows) => {
            setValues((s) => [
              ...s.filter((v) => v.input.Tipo !== "CARTERA"),
              ...rows,
            ]);
            setPortfolio(false);
          }}
        />
      )}
      {editor !== null && (
        <ValueEditor
          {...(editor >= 0 ? { initial: values[editor] } : {})}
          sense={sense}
          options={options}
          onClose={() => setEditor(null)}
          onConfirm={(value) => {
            setValues((s) =>
              editor < 0
                ? [...s, value]
                : s.map((v, i) => (i === editor ? value : v)),
            );
            setEditor(null);
          }}
        />
      )}
      {consultingCheque && (
        <ChequeProperties
          id={consultingCheque}
          onClose={() => setConsultingCheque(null)}
          onExpired={onExpired}
        />
      )}
      {changePending && (
        <Modal
          title="Cambiar datos de cabecera"
          busy={false}
          onClose={() => {
            setChangePending(null);
            setClientRevision((n) => n + 1);
          }}
        >
          <div className="modal-body">
            <p>
              El cambio puede descartar las afectaciones, el importe a cuenta y
              los valores incompatibles con la nueva operación.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setChangePending(null);
                setClientRevision((n) => n + 1);
              }}
            >
              Conservar cabecera
            </button>
            <button
              className="button primary"
              onClick={() => {
                changePending();
                setChangePending(null);
              }}
            >
              Aplicar cambio
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
