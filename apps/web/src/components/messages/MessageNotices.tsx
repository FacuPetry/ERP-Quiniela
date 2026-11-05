import { useEffect, useState } from "react";
import type {
  BalanceMessagePreview,
  MessageNotice,
  MessageNoticesResult,
} from "@erp/shared";
import { Modal } from "../ui/Modal";
import { OffCanvas } from "../ui/OffCanvas";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { ActionToolbar } from "../ui/ActionToolbar";
import { Pagination } from "../ui/Pagination";
import { TextArea } from "../controls";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { displayDate, displayDateTime } from "../controls/date-value";
import {
  listMessageNotices,
  registerMessageNotice,
} from "../../services/messages";
import { ApiRequestError } from "../../services/http";
import { messagePreview } from "./message-preview";
export interface NoticeTarget {
  preview: BalanceMessagePreview;
  template: string;
  key: string;
}
export function LastMessageNotice({
  notice,
  onHistory,
}: {
  notice: MessageNotice | null;
  onHistory: () => void;
}) {
  return notice ? (
    <button
      type="button"
      className="message-notice-link"
      onClick={onHistory}
      title={`Confirmación manual de ${notice.UsuarioNombre} · ${displayDateTime(notice.RegistradoEn)}. Consultar historial.`}
    >
      {displayDateTime(notice.RegistradoEn).slice(0, 10)} ·{" "}
      {formatAmount(notice.SaldoTotal, amountFormat())}
    </button>
  ) : (
    <span className="muted">Sin avisos registrados</span>
  );
}
export function RegisterMessageNotice({
  target,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  target: NoticeTarget;
  csrf: string;
  onClose: () => void;
  onSaved: (notice: MessageNotice) => void;
  onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rendered = messagePreview(target.template, target.preview);
  async function confirm() {
    if (busy || !target.preview.RegistroToken || rendered.error) return;
    setBusy(true);
    setError("");
    try {
      const saved = await registerMessageNotice(
        target.preview.RegistroToken!,
        target.template,
        csrf,
        target.key,
      );
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error ? e.message : "No se pudo registrar el aviso.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Registrar envío"
      busy={busy}
      onClose={onClose}
      lockScroll
      restoreFocus
    >
      <div className="modal-body messages-notice-confirm">
        <p>
          ¿Confirmás que enviaste este mensaje? La confirmación es manual;
          WhatsApp no informa la entrega al sistema.
        </p>
        <p>
          <strong>
            {target.preview.Cliente} · {target.preview.ClienteNombre}
          </strong>
        </p>
        <p>
          Teléfono registrado:{" "}
          {target.preview.Telefono || "Sin teléfono configurado"}
        </p>
        <p>
          Saldo informado:{" "}
          {formatAmount(target.preview.SaldoTotal, amountFormat())} · Al{" "}
          {displayDate(target.preview.FechaHasta)}
        </p>
        {target.preview.UltimoAviso && (
          <p className="muted small">
            Último aviso:{" "}
            {displayDateTime(target.preview.UltimoAviso.RegistradoEn)} ·{" "}
            {formatAmount(
              target.preview.UltimoAviso.SaldoTotal,
              amountFormat(),
            )}
            . Esta confirmación registrará un aviso nuevo.
          </p>
        )}
        <TextArea
          label="Mensaje que confirmás haber enviado"
          value={rendered.message}
          readOnly
          onValueChange={() => {}}
          height={160}
        />
        <p className="muted small">
          Revisá que coincida con lo enviado en WhatsApp. Se conservarán este
          texto y este saldo, aunque después cambien.
        </p>
        {(error || rendered.error) && (
          <p className="notice error" role="alert">
            {error || rendered.error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button primary"
          disabled={
            busy || !target.preview.RegistroToken || Boolean(rendered.error)
          }
          onClick={() => {
            void confirm();
          }}
        >
          {busy ? "Registrando…" : "Confirmar envío"}
        </button>
      </div>
    </Modal>
  );
}
const columns: TableColumn<MessageNotice>[] = [
  {
    key: "RegistradoEn",
    label: "Registrado el",
    render: (r) => displayDateTime(r.RegistradoEn),
  },
  {
    key: "SaldoTotal",
    label: "Saldo informado",
    align: "right",
    render: (r) => formatAmount(r.SaldoTotal, amountFormat()),
  },
  {
    key: "FechaSaldo",
    label: "Saldo al",
    render: (r) => displayDate(r.FechaSaldo),
  },
  {
    key: "UsuarioNombre",
    label: "Registrado por",
    render: (r) => r.UsuarioNombre,
  },
  {
    key: "Telefono",
    label: "Teléfono registrado",
    render: (r) => r.Telefono ?? "Sin teléfono",
  },
  {
    key: "Mensaje",
    label: "Mensaje",
    render: (r) => (
      <span className="report-ledger-details" title={r.Mensaje}>
        {r.Mensaje}
      </span>
    ),
    property: (r) => r.Mensaje,
  },
  { key: "Canal", label: "Confirmación", render: () => "WhatsApp · Manual" },
];
export function MessageNoticeHistory({
  client,
  onClose,
  onExpired,
}: {
  client: { Cliente: string; ClienteNombre: string };
  onClose: () => void;
  onExpired: () => void;
}) {
  const [data, setData] = useState<MessageNoticesResult | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    setBusy(true);
    setError("");
    setData(null);
    void listMessageNotices(client.Cliente, page, request.signal)
      .then((r) => {
        if (!request.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar el historial.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [client.Cliente, page, revision, onExpired]);
  return (
    <OffCanvas
      open
      title={`Avisos · ${client.ClienteNombre}`}
      size="lg"
      onClose={onClose}
    >
      <div className="report-layout messages-notice-history">
        <p className="muted small">
          Confirmaciones manuales compartidas. No acreditan entrega ni lectura
          de WhatsApp. El texto completo se consulta desde Propiedades.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <section className="panel report-results">
          <DataTable
            caption="Historial de avisos"
            rows={data?.registros ?? []}
            columns={columns}
            rowKey={(r) => r.IDTabla}
            rowLabel={(r) => displayDateTime(r.RegistradoEn)}
            loading={busy}
            bordered={false}
            toolbar={({ selected, onProperties }) => (
              <div className="report-toolbar">
                <h4>Historial de avisos</h4>
                <ActionToolbar
                  labels={{}}
                  selected={selected}
                  busy={busy}
                  readOnly
                  filtersActive={false}
                  onProperties={onProperties}
                  onRefresh={() => setRevision((v) => v + 1)}
                />
              </div>
            )}
          />
          {data && (
            <Pagination
              page={data.pagina}
              total={data.total}
              limit={data.limite}
              loading={busy}
              onChange={setPage}
            />
          )}
        </section>
      </div>
    </OffCanvas>
  );
}
