import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  voucherNumberError,
  numberSuggestion,
  type CurrentAccountDetail,
  type CurrentAccountInput,
  type CurrentAccountOptions,
  type MasterRecord,
} from "@erp/shared";
import {
  TextBox,
  DropDown,
  TextArea,
  DatePicker,
  AmountBox,
  NumeroComprobante,
  todayISO,
  defaultNumericValue,
} from "../controls";
import { FormSections } from "../ui/FormSections";
import { useInitialFieldFocus } from "../ui/useInitialFieldFocus";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { ClientSearch } from "./ClientSearch";
import { accountOptions, createAccount } from "../../services/current-account";
import { ApiRequestError } from "../../services/http";
export function CurrentAccountForm({
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
  onAnnul,
}: {
  detail?: CurrentAccountDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
  onAnnul?: () => void;
}) {
  const previous = detail?.registro;
  const [client, setClient] = useState<MasterRecord | null>(null);
  const [options, setOptions] = useState<CurrentAccountOptions>({
    comprobantes: [],
    numeradores: [],
    conceptos: [],
  });
  const [loading, setLoading] = useState(!previous),
    [revision, setRevision] = useState(0);
  const [input, setInput] = useState<CurrentAccountInput>(() => {
    const today = todayISO();
    return previous
      ? {
          Cliente: previous.Cliente,
          Concepto: previous.Concepto,
          Comprobante: previous.Comprobante,
          NumeroComprobante: previous.NumeroComprobante ?? "0",
          FechaOrigen: previous.FechaOrigen,
          Vencimiento: previous.Vencimiento,
          Importe: previous.Importe,
          Observacion: previous.Observacion,
        }
      : {
          Cliente: "",
          Concepto: null,
          Comprobante: "",
          NumeroComprobante: "0",
          FechaOrigen: today,
          Vencimiento: today,
          Importe: defaultNumericValue,
          Observacion: null,
        };
  });
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
  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const name = [
        "Comprobante",
        "NumeroComprobante",
        "Cliente",
        "FechaOrigen",
        "Vencimiento",
        "Concepto",
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
    Vencimiento: "Fecha de vencimiento",
    Importe: "Importe",
    Concepto: "Concepto",
    Observacion: "Observaciones",
  };
  function change<K extends keyof CurrentAccountInput>(
    key: K,
    value: CurrentAccountInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }
  const numbering = numberSuggestion(input.Comprobante, options.numeradores);
  const numberValue =
    !previous && numbering.automatic
      ? numbering.number
      : input.NumeroComprobante;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (previous || busy || loading) return;
    const payload = {
      ...input,
      NumeroComprobante: numbering.automatic ? "0" : numberValue,
      NumeroAutomatico: numbering.automatic,
      Cliente: client ? String(client.Codigo) : "",
      Importe: input.Importe,
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
    const numberError = numbering.automatic
      ? undefined
      : voucherNumberError(payload.NumeroComprobante);
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
    <section className="panel record-form account-form" aria-busy={busy}>
      <div className="form-heading">
        <h2 ref={heading} tabIndex={-1}>
          {previous ? "Consultar movimiento" : "Nuevo movimiento"}
        </h2>
        <FormToolbarActions
          closeAction={
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              {previous ? "Cerrar" : "Cancelar"}
            </button>
          }
          {...(previous?.Estado === "CONFIRMADO" && onAnnul
            ? {
                annulAction: {
                  onClick: onAnnul,
                  disabled: busy || Boolean(previous.CajaMovimiento),
                },
              }
            : {})}
        >
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
        </FormToolbarActions>
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
              {!previous && !loading && (
                <button type="button" onClick={() => setRevision((v) => v + 1)}>
                  Actualizar opciones
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
          <FormSections
            idPrefix={formId}
            sections={[
              {
                key: "general",
                title: "Datos generales",
                content: (
                  <div className="form-grid account-general-grid">
                    {previous ? (
                      <TextBox
                        label="Comprobante"
                        size="md"
                        value={previous.ComprobanteDescripcion}
                        readOnly
                        onValueChange={() => {}}
                      />
                    ) : (
                      <DropDown
                        {...presentation("Comprobante")}
                        label="Comprobante"
                        size="md"
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
                    <div className="account-number-column">
                      {previous && previous.NumeroComprobante === null ? (
                        <TextBox
                          label="Número de comprobante"
                          size="md"
                          value="Sin número"
                          readOnly
                          onValueChange={() => {}}
                        />
                      ) : (
                        <NumeroComprobante
                          {...presentation("NumeroComprobante")}
                          label="Número de comprobante"
                          size="md"
                          value={numberValue}
                          required={!previous}
                          readOnly={Boolean(previous) || numbering.automatic}
                          hint={!previous ? numbering.notice : undefined}
                          disabled={busy || loading}
                          onValueChange={(value) =>
                            change("NumeroComprobante", value)
                          }
                        />
                      )}
                    </div>
                    {previous ? (
                      <TextBox
                        label="Cliente"
                        size="lg"
                        value={`${previous.Cliente} - ${previous.ClienteNombre}`}
                        readOnly
                        onValueChange={() => {}}
                      />
                    ) : (
                      <ClientSearch
                        {...presentation("Cliente")}
                        label="Cliente"
                        size="lg"
                        required
                        value={client}
                        onChange={(value) => {
                          setClient(value);
                          setErrors((current) => ({ ...current, Cliente: "" }));
                        }}
                        onExpired={onExpired}
                        disabled={busy}
                      />
                    )}
                    <div className="account-date-fields">
                      {(["FechaOrigen", "Vencimiento"] as const).map((name) => (
                        <DatePicker
                          key={name}
                          {...presentation(name)}
                          label={
                            name === "FechaOrigen"
                              ? "Fecha de origen"
                              : "Fecha de vencimiento"
                          }
                          size="sm"
                          required={!previous && name === "FechaOrigen"}
                          value={input[name] ?? ""}
                          readOnly={Boolean(previous)}
                          disabled={busy}
                          onValueChange={(value) => {
                            if (name === "FechaOrigen") change(name, value);
                            else change(name, value || null);
                          }}
                        />
                      ))}
                    </div>
                    {previous ? (
                      <TextBox
                        label="Concepto"
                        size="lg"
                        value={previous.ConceptoDescripcion ?? ""}
                        readOnly
                        onValueChange={() => {}}
                      />
                    ) : (
                      <DropDown
                        {...presentation("Concepto")}
                        label="Concepto"
                        size="lg"
                        value={input.Concepto ?? ""}
                        disabled={busy}
                        loading={loading}
                        options={[
                          { value: "", label: "Sin concepto" },
                          ...options.conceptos.map((concept) => ({
                            value: concept.Codigo,
                            label: concept.Descripcion,
                          })),
                        ]}
                        onValueChange={(value) =>
                          change("Concepto", value || null)
                        }
                      />
                    )}
                    <TextArea
                      {...presentation("Observacion")}
                      label="Observaciones"
                      size="xl"
                      value={input.Observacion ?? ""}
                      maxLength={4000}
                      readOnly={Boolean(previous)}
                      disabled={busy}
                      onValueChange={(value) =>
                        change("Observacion", value || null)
                      }
                    />
                    {previous && (
                      <TextBox
                        label="Estado"
                        size="sm"
                        value={
                          previous.Estado === "ANULADO"
                            ? "Anulado"
                            : "Confirmado"
                        }
                        readOnly
                        onValueChange={() => {}}
                      />
                    )}
                    {previous?.MotivoAnulacion && (
                      <TextArea
                        label="Motivo de anulación"
                        value={previous.MotivoAnulacion}
                        size="xl"
                        readOnly
                        onValueChange={() => {}}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: "amounts",
                title: "Importes",
                content: (
                  <fieldset className="account-amounts">
                    <legend>Importes</legend>
                    <AmountBox
                      {...presentation("Importe")}
                      label="Importe"
                      size="md"
                      value={input.Importe}
                      required={!previous}
                      readOnly={Boolean(previous)}
                      disabled={busy}
                      maxIntegerDigits={16}
                      onValueChange={(value) => change("Importe", value)}
                    />
                  </fieldset>
                ),
              },
            ]}
          />
        </div>
      </form>
    </section>
  );
}
