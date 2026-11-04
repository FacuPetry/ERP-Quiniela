import { useEffect, useRef, useState } from "react";
import {
  defaultMessageTemplate,
  maxMessageTemplateLength,
  messageTemplateProblem,
  messageVariables,
  type MessageTemplatePreference,
} from "@erp/shared";
import { DropDown, TextArea } from "../controls";
import { Icon } from "../Icon";
import {
  getMessageTemplate,
  saveMessageTemplate,
} from "../../services/messages";
import { ApiRequestError } from "../../services/http";

export function MessageTemplateEditor({
  csrf,
  onChange,
  onExpired,
}: {
  csrf: string;
  onChange: (template: string | null) => void;
  onExpired: () => void;
}) {
  const [draft, setDraft] = useState(defaultMessageTemplate);
  const [saved, setSaved] = useState<MessageTemplatePreference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [variable, setVariable] = useState<string>(messageVariables[0].key);
  const editor = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const problem = messageTemplateProblem(draft);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    onChange(null);
    try {
      const result = await getMessageTemplate(controller.signal);
      if (controller.signal.aborted) return;
      setSaved(result);
      const template = result.Plantilla ?? defaultMessageTemplate;
      setDraft(template);
      onChange(template);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo cargar el mensaje guardado.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [onChange, onExpired]);
  function change(value: string) {
    setDraft(value);
    onChange(value);
    setStatus("");
    setError("");
  }
  function insert() {
    const control = editor.current;
    const start = control?.selectionStart ?? draft.length;
    const end = control?.selectionEnd ?? start;
    const token = `{${variable}}`;
    const value = draft.slice(0, start) + token + draft.slice(end);
    if (value.length > maxMessageTemplateLength) {
      setError(
        `El mensaje admite hasta ${maxMessageTemplateLength} caracteres.`,
      );
      return;
    }
    change(value);
    requestAnimationFrame(() => {
      control?.focus();
      control?.setSelectionRange(start + token.length, start + token.length);
    });
  }
  async function save() {
    if (!saved || problem || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await saveMessageTemplate(
        draft === defaultMessageTemplate ? null : draft,
        saved.version,
        csrf,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSaved(result);
      setStatus("Mensaje guardado para tu usuario.");
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error ? e.message : "No se pudo guardar el mensaje.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="messages-template"
      aria-labelledby="message-template-title"
      aria-busy={busy}
    >
      <h3 id="message-template-title">Mensaje personalizado</h3>
      <TextArea
        ref={editor}
        label="Texto del mensaje"
        value={draft}
        onValueChange={change}
        disabled={busy || !saved}
        maxLength={maxMessageTemplateLength}
        height={140}
        error={saved ? problem : undefined}
        hint="Guardá el texto con sus variables para reutilizarlo desde tu usuario, incluso en otro dispositivo."
      />
      <div className="messages-controls">
        <DropDown
          label="Variable disponible"
          size="md"
          value={variable}
          onValueChange={setVariable}
          disabled={busy || !saved}
          options={messageVariables.map((v) => ({
            value: v.key,
            label: `${v.label} · {${v.key}}`,
          }))}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy || !saved}
          onClick={insert}
        >
          <Icon name="plus" size={17} /> Insertar variable
        </button>
      </div>
      <p className="muted small">
        {messageVariables.find((v) => v.key === variable)?.description}
      </p>
      <div className="messages-actions">
        <button
          type="button"
          className="button primary"
          disabled={
            busy ||
            !saved ||
            Boolean(problem) ||
            draft === (saved.Plantilla ?? defaultMessageTemplate)
          }
          onClick={() => {
            void save();
          }}
        >
          Guardar mensaje
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !saved || draft === defaultMessageTemplate}
          onClick={() => change(defaultMessageTemplate)}
        >
          Usar mensaje predeterminado
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => {
            void load();
          }}
        >
          Cargar mensaje guardado
        </button>
      </div>
      {busy && (
        <p className="muted small" role="status">
          Procesando mensaje personalizado…
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="muted small" role="status">
          {status}
        </p>
      )}
      {!busy &&
        saved &&
        !status &&
        draft !== (saved.Plantilla ?? defaultMessageTemplate) && (
          <p className="muted small">Tenés cambios sin guardar.</p>
        )}
    </section>
  );
}
