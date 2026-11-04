import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderMessageTemplate,
  whatsappMessageUrl,
  type BalanceMessagePreview,
  type MasterRecord,
} from "@erp/shared";
import { AmountBox, TextArea, TextBox } from "../controls";
import { displayDate, displayDateTime } from "../controls/date-value";
import { ClientSearch } from "../current-account/ClientSearch";
import { Icon } from "../Icon";
import { FormSections } from "../ui/FormSections";
import { ApiRequestError } from "../../services/http";
import { previewBalanceMessage } from "../../services/messages";
import { MessageTemplateEditor } from "./MessageTemplateEditor";
import "./messages.css";

export function MessagesPage({
  csrf,
  onExpired,
}: {
  csrf: string;
  onExpired: () => void;
}) {
  const [template, setTemplate] = useState<string | null>(null);
  const [client, setClient] = useState<MasterRecord | null>(null);
  const [preview, setPreview] = useState<BalanceMessagePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const changeTemplate = useCallback((value: string | null) => {
    setTemplate(value);
    setStatus("");
  }, []);
  const rendered = useMemo(() => {
    if (!preview || template === null) return { message: "", error: undefined };
    try {
      return {
        message: renderMessageTemplate(template, preview.Variables),
        error: undefined,
      };
    } catch (e) {
      return {
        message: "",
        error:
          e instanceof Error ? e.message : "Revisá las variables del mensaje.",
      };
    }
  }, [preview, template]);
  const latestMessage = useRef(rendered.message);
  latestMessage.current = rendered.message;
  const whatsapp =
    preview && !rendered.error
      ? whatsappMessageUrl(preview.WhatsAppNumero, rendered.message)
      : null;
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const text = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => () => {
      revision.current++;
      request.current?.abort();
    },
    [],
  );

  async function load(code: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++revision.current;
    setPreview(null);
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const data = await previewBalanceMessage(code, controller.signal);
      if (controller.signal.aborted || current !== revision.current) return;
      setPreview(data);
    } catch (e) {
      if (controller.signal.aborted || current !== revision.current) return;
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error ? e.message : "No se pudo preparar el mensaje.",
        );
    } finally {
      if (!controller.signal.aborted && current === revision.current)
        setLoading(false);
    }
  }
  function select(next: MasterRecord | null) {
    request.current?.abort();
    revision.current++;
    setClient(next);
    setPreview(null);
    setError("");
    setStatus("");
    setLoading(false);
    if (next) void load(String(next.Codigo));
  }
  async function copy() {
    if (!preview || !rendered.message || rendered.error || loading || copying)
      return;
    const current = revision.current;
    const message = rendered.message;
    setCopying(true);
    setError("");
    setStatus("");
    try {
      await navigator.clipboard.writeText(message);
      if (current === revision.current && latestMessage.current === message)
        setStatus(
          "Mensaje copiado. Pegalo en WhatsApp para enviarlo manualmente.",
        );
    } catch {
      if (current === revision.current) {
        text.current?.focus();
        text.current?.select();
        setError(
          "No se pudo copiar automáticamente. Seleccioná el texto de la vista previa y copialo manualmente.",
        );
      }
    } finally {
      if (current === revision.current) setCopying(false);
    }
  }
  return (
    <section
      className="panel record-form messages-panel"
      aria-labelledby="messages-title"
    >
      <div className="panel-heading form-heading">
        <div>
          <h2 id="messages-title">Preparar mensaje</h2>
          <p className="muted small">
            Seleccioná un cliente y revisá el mensaje antes de copiarlo.
          </p>
        </div>
        <span className="section-icon">
          <Icon name="message" />
        </span>
      </div>
      <FormSections
        idPrefix="messages-sections"
        sections={[
          {
            key: "configure",
            title: "Configurar mensaje",
            content: (
              <MessageTemplateEditor
                csrf={csrf}
                onChange={changeTemplate}
                onExpired={onExpired}
              />
            ),
          },
          {
            key: "delivery",
            title: "Envío de mensajes",
            content: (
              <div className="messages-delivery">
                <div className="messages-controls">
                  <ClientSearch
                    id="messages-client"
                    label="Cliente"
                    required
                    historical
                    size="lg"
                    value={client}
                    onChange={select}
                    onExpired={onExpired}
                    disabled={copying || template === null}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!client || loading || copying}
                    onClick={() => {
                      if (client) void load(String(client.Codigo));
                    }}
                  >
                    <Icon name="refresh" size={17} /> Actualizar mensaje
                  </button>
                </div>
                <div className="messages-query-feedback">
                  {loading && (
                    <p className="muted small" role="status">
                      Consultando saldo y preparando mensaje…
                    </p>
                  )}
                  {error && (
                    <p className="notice error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
                <div className="messages-preview">
                  <div className="messages-balance">
                    <AmountBox
                      label="Saldo total"
                      size="md"
                      value={preview?.SaldoTotal ?? ""}
                      onValueChange={() => {}}
                      readOnly
                    />
                    <TextBox
                      label="Saldo hasta"
                      size="sm"
                      value={displayDate(preview?.FechaHasta)}
                      onValueChange={() => {}}
                      readOnly
                    />
                    <TextBox
                      label="Teléfono"
                      size="md"
                      value={
                        preview ? (preview.Telefono ?? "Sin teléfono") : ""
                      }
                      onValueChange={() => {}}
                      readOnly
                    />
                  </div>
                  <p className="muted small messages-summary">
                    {preview && (
                      <>
                        {preview.Situacion === "PENDIENTE_PAGO"
                          ? "Saldo neto a pagar por el cliente."
                          : preview.Situacion === "A_FAVOR"
                            ? "Saldo neto a favor del cliente."
                            : "Saldo neto de Cuenta corriente en cero."}{" "}
                        Consultado: {displayDateTime(preview.consultadoEn)}.
                      </>
                    )}
                  </p>
                  <TextArea
                    ref={text}
                    label="Vista previa del mensaje"
                    value={rendered.message}
                    error={rendered.error}
                    onValueChange={() => {}}
                    readOnly
                    height="clamp(150px, 22vw, 200px)"
                    hint="Revisá el mensaje antes de copiarlo o abrir WhatsApp. El envío se confirma dentro de WhatsApp."
                  />
                  <p
                    className="muted small messages-phone-feedback"
                    role="status"
                  >
                    {preview?.WhatsAppError ??
                      (preview?.WhatsAppNumero
                        ? `WhatsApp: +${preview.WhatsAppNumero}`
                        : "")}
                  </p>
                  <div className="messages-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={
                        !preview ||
                        copying ||
                        !rendered.message ||
                        Boolean(rendered.error)
                      }
                      onClick={() => {
                        void copy();
                      }}
                    >
                      <Icon name="copy" size={17} />{" "}
                      {copying ? "Copiando…" : "Copiar mensaje"}
                    </button>
                    {whatsapp ? (
                      <a
                        className="button secondary"
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir chat con +${preview?.WhatsAppNumero}`}
                      >
                        Abrir WhatsApp
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        disabled
                        title={
                          preview?.WhatsAppError ??
                          (preview
                            ? "Revisá el texto del mensaje."
                            : "Seleccioná un cliente.")
                        }
                      >
                        Abrir WhatsApp
                      </button>
                    )}
                  </div>
                  <p
                    className="muted small messages-copy-feedback"
                    role="status"
                  >
                    {status}
                  </p>
                </div>
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
