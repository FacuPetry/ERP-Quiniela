import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  voucherNumberError,
  type CurrentAccountDetail,
  type CurrentAccountInput,
  type CurrentAccountOptions,
  type MasterRecord,
} from "@erp/shared";
import {
  TextBox,
  DropDown,
  TextArea,
  Field,
  NumeroComprobante,
} from "../controls";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";
import { ClientSearch } from "./ClientSearch";
import { accountOptions, createAccount } from "../../services/current-account";
import { ApiRequestError } from "../../services/http";
export function CurrentAccountForm({
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  detail?: CurrentAccountDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const previous = detail?.registro;
  const [client, setClient] = useState<MasterRecord | null>(null);
  const [options, setOptions] = useState<CurrentAccountOptions>({
    comprobantes: [],
    numeradores: [],
  });
  const [loading, setLoading] = useState(!previous),
    [revision, setRevision] = useState(0);
  const [input, setInput] = useState<CurrentAccountInput>(() =>
    previous
      ? {
          Cliente: previous.Cliente,
          Comprobante: previous.Comprobante,
          NumeroComprobante: previous.NumeroComprobante ?? "0",
          FechaOrigen: previous.FechaOrigen,
          Vencimiento: previous.Vencimiento,
          Importe: previous.Importe,
          Observacion: previous.Observacion,
        }
      : {
          Cliente: "",
          Comprobante: "",
          NumeroComprobante: "0",
          FechaOrigen: new Intl.DateTimeFormat("sv-SE", {
            timeZone: "America/Argentina/Buenos_Aires",
          }).format(new Date()),
          Vencimiento: null,
          Importe: "",
          Observacion: null,
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null),
    form = useRef<HTMLFormElement>(null),
    retry = useRef({ body: "", key: "" });
  const formId = useId();
  useInitialFieldFocus(form, heading);
  useEffect(() => {
    if (previous) return;
    const request = new AbortController();
    setLoading(true);
    setError("");
    void accountOptions(request.signal)
      .then((data) => {
        if (!request.signal.aborted) {
          setOptions(data);
          if (input.Comprobante)
            setInput((current) => ({
              ...current,
              NumeroComprobante:
                data.numeradores.find(
                  (n) => n.Comprobante === input.Comprobante,
                )?.ProximoNumero ?? "0",
            }));
        }
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los comprobantes.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [previous, revision, onExpired, input.Comprobante]);
  const voucher = options.comprobantes.find(
    (v) => v.Codigo === input.Comprobante,
  );
  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const name = [
        "Cliente",
        "Comprobante",
        "NumeroComprobante",
        "FechaOrigen",
        "Vencimiento",
        "Importe",
        "Observacion",
      ].find((name) => fields[name]);
      if (name) document.getElementById(`account-${name}`)?.focus();
    });
  }
  const labels: Record<string, string> = {
    Cliente: "Cliente",
    Comprobante: "Comprobante",
    NumeroComprobante: "Número de comprobante",
    FechaOrigen: "Fecha de origen",
    Vencimiento: "Vencimiento",
    Importe: "Importe",
    Observacion: "Observaciones",
  };
  function change<K extends keyof CurrentAccountInput>(
    key: K,
    value: CurrentAccountInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (previous || busy || loading) return;
    const payload = {
      ...input,
      Cliente: client ? String(client.Codigo) : "",
      Importe: input.Importe.replace(",", "."),
    };
    const invalid: Record<string, string> = {};
    for (const name of [
      "Cliente",
      "Comprobante",
      "NumeroComprobante",
      "FechaOrigen",
      "Importe",
    ] as const)
      if (!payload[name]) invalid[name] = "Completá este campo.";
    const numberError = voucherNumberError(payload.NumeroComprobante);
    if (numberError) invalid.NumeroComprobante = numberError;
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setError("Revisá los campos indicados.");
      focusError(invalid);
      return;
    }
    const body = JSON.stringify(payload);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await createAccount(payload, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        if (e instanceof ApiRequestError) {
          setErrors(e.campos);
          focusError(e.campos);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const presentation = (name: string) => ({
    id: `account-${name}`,
    error: errors[name],
  });
  return (
    <section className="panel record-form" aria-busy={busy}>
      <div className="form-heading">
        <h2 ref={heading} tabIndex={-1}>
          {previous ? "Consultar movimiento" : "Nuevo movimiento"}
        </h2>
        <div className="form-toolbar-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {previous ? "Cerrar" : "Cancelar"}
          </button>
          {!previous && (
            <button
              className="button primary"
              form={formId}
              type="submit"
              disabled={busy || loading}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
      <form
        ref={form}
        id={formId}
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="form-body">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <ul>
                {Object.entries(errors)
                  .filter(([, value]) => value)
                  .map(([key, value]) => (
                    <li key={key}>
                      {labels[key] ?? "Formulario"}: {value}
                    </li>
                  ))}
              </ul>
              {!options.comprobantes.length && !loading && (
                <button type="button" onClick={() => setRevision((v) => v + 1)}>
                  Reintentar carga
                </button>
              )}
            </div>
          )}
          {!previous && !loading && !error && !options.comprobantes.length && (
            <p className="notice">
              No hay comprobantes compatibles activos. Configurá uno de Cuenta
              corriente, con cuenta y naturaleza aplicables y sentido de fondos
              No aplica.
            </p>
          )}
          <div className="form-grid">
            {previous ? (
              <TextBox
                label="Cliente"
                value={`${previous.Cliente} · ${previous.ClienteNombre}`}
                readOnly
                onValueChange={() => {}}
              />
            ) : (
              <ClientSearch
                {...presentation("Cliente")}
                label="Cliente"
                required
                value={client}
                onChange={setClient}
                onExpired={onExpired}
                disabled={busy}
              />
            )}
            {previous ? (
              <TextBox
                label="Comprobante"
                value={previous.ComprobanteDescripcion}
                readOnly
                onValueChange={() => {}}
              />
            ) : (
              <DropDown
                {...presentation("Comprobante")}
                label="Comprobante"
                required
                value={input.Comprobante}
                disabled={busy}
                loading={loading}
                options={[
                  { value: "", label: "Seleccioná una opción" },
                  ...options.comprobantes.map((v) => ({
                    value: v.Codigo,
                    label: v.Descripcion,
                  })),
                ]}
                onValueChange={(value) =>
                  setInput((current) => ({
                    ...current,
                    Comprobante: value,
                    NumeroComprobante: "0",
                  }))
                }
              />
            )}
            {previous && previous.NumeroComprobante === null ? (
              <TextBox
                label="Número de comprobante"
                value="Sin número"
                readOnly
                onValueChange={() => {}}
              />
            ) : (
              <NumeroComprobante
                {...presentation("NumeroComprobante")}
                label="Número de comprobante"
                value={input.NumeroComprobante}
                required={!previous}
                readOnly={Boolean(previous)}
                disabled={busy || loading}
                onValueChange={(value) => change("NumeroComprobante", value)}
                hint={
                  !previous
                    ? "El próximo número se sugiere automáticamente si el comprobante tiene un numerador activo. Podés editar ambas partes antes de guardar."
                    : undefined
                }
              />
            )}
            {(["FechaOrigen", "Vencimiento"] as const).map((name) => (
              <Field
                key={name}
                {...presentation(name)}
                label={
                  name === "FechaOrigen" ? "Fecha de origen" : "Vencimiento"
                }
                required={!previous && name === "FechaOrigen"}
              >
                {(binding) => (
                  <input
                    {...binding}
                    className="base-control"
                    type="date"
                    value={input[name] ?? ""}
                    readOnly={Boolean(previous)}
                    disabled={busy}
                    onChange={(event) => {
                      if (name === "FechaOrigen")
                        change(name, event.target.value);
                      else change(name, event.target.value || null);
                    }}
                  />
                )}
              </Field>
            ))}
            <TextBox
              label="Cuenta"
              value={
                (previous?.Cuenta ?? voucher?.Cuenta) === "COBRAR"
                  ? "Cobrar"
                  : (previous?.Cuenta ?? voucher?.Cuenta) === "PAGAR"
                    ? "Pagar"
                    : ""
              }
              readOnly
              onValueChange={() => {}}
            />
            <TextBox
              label="Naturaleza"
              value={
                (previous?.Naturaleza ?? voucher?.Naturaleza) === "DEUDA"
                  ? "Deuda"
                  : (previous?.Naturaleza ?? voucher?.Naturaleza) === "CREDITO"
                    ? "Crédito"
                    : ""
              }
              readOnly
              onValueChange={() => {}}
            />
            <TextBox
              {...presentation("Importe")}
              label="Importe"
              value={input.Importe}
              required={!previous}
              inputMode="decimal"
              readOnly={Boolean(previous)}
              disabled={busy}
              maxLength={19}
              onValueChange={(value) => change("Importe", value)}
            />
            {previous && (
              <TextBox
                label="Estado"
                value={previous.Estado === "ANULADO" ? "Anulado" : "Confirmado"}
                readOnly
                onValueChange={() => {}}
              />
            )}
            <TextArea
              {...presentation("Observacion")}
              label="Observaciones"
              value={input.Observacion ?? ""}
              maxLength={4000}
              wide
              readOnly={Boolean(previous)}
              disabled={busy}
              onValueChange={(value) => change("Observacion", value || null)}
            />
            {previous?.MotivoAnulacion && (
              <TextArea
                label="Motivo de anulación"
                value={previous.MotivoAnulacion}
                wide
                readOnly
                onValueChange={() => {}}
              />
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
