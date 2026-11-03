import { useEffect, useRef, useState } from "react";
import type { BalanceMessagePreview, MasterRecord } from "@erp/shared";
import { AmountBox, TextArea, TextBox } from "../controls";
import { displayDate, displayDateTime } from "../controls/date-value";
import { ClientSearch } from "../current-account/ClientSearch";
import { Icon } from "../Icon";
import { ApiRequestError } from "../../services/http";
import { previewBalanceMessage } from "../../services/messages";
import "./messages.css";

export function MessagesPage({ onExpired }: { onExpired: () => void }) {
  const [client, setClient] = useState<MasterRecord | null>(null);
  const [preview, setPreview] = useState<BalanceMessagePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
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
    if (!preview || loading || copying) return;
    const current = revision.current;
    setCopying(true);
    setError("");
    setStatus("");
    try {
      await navigator.clipboard.writeText(preview.Mensaje);
      if (current === revision.current)
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
    <section className="panel messages-panel" aria-labelledby="messages-title">
      <div className="panel-heading">
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
          disabled={copying}
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
      {preview && (
        <div className="messages-preview">
          <div className="messages-balance">
            <AmountBox
              label="Saldo total"
              size="md"
              value={preview.SaldoTotal}
              onValueChange={() => {}}
              readOnly
            />
            <TextBox
              label="Saldo hasta"
              size="sm"
              value={displayDate(preview.FechaHasta)}
              onValueChange={() => {}}
              readOnly
            />
          </div>
          <p className="muted small">
            {preview.Situacion === "PENDIENTE_PAGO"
              ? "Saldo neto a pagar por el cliente."
              : preview.Situacion === "A_FAVOR"
                ? "Saldo neto a favor del cliente."
                : "Saldo neto de Cuenta corriente en cero."}{" "}
            Consultado: {displayDateTime(preview.consultadoEn)}.
          </p>
          <TextArea
            ref={text}
            label="Vista previa del mensaje"
            value={preview.Mensaje}
            onValueChange={() => {}}
            readOnly
            height="clamp(150px, 22vw, 200px)"
            hint="El texto se prepara para copiarlo. No se envía ningún mensaje desde el sistema."
          />
          <div className="messages-actions">
            <button
              type="button"
              className="button primary"
              disabled={copying}
              onClick={() => {
                void copy();
              }}
            >
              <Icon name="copy" size={17} />{" "}
              {copying ? "Copiando…" : "Copiar mensaje"}
            </button>
            {status && (
              <p className="muted small" role="status">
                {status}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
