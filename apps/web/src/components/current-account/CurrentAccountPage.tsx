import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CurrentAccountDetail,
  CurrentAccountList,
  CurrentAccountRecord,
  MasterRecord,
  SessionResponse,
} from "@erp/shared";
import {
  accountList,
  accountDetail,
  cancelAccount,
} from "../../services/current-account";
import { ApiRequestError } from "../../services/http";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { ActionToolbar } from "../ui/ActionToolbar";
import { Modal } from "../ui/Modal";
import { initialListFilters } from "../ui/filter-defaults";
import { TextBox, DropDown, TextArea, DatePicker } from "../controls";
import { ClientSearch } from "./ClientSearch";
import { CurrentAccountForm } from "./CurrentAccountForm";
import { CurrentAccountProperties } from "./CurrentAccountProperties";
import "./current-account.css";
function amount(value: string) {
  const [whole, decimals = "00"] = value.split(".");
  return (
    whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decimals.padEnd(2, "0")
  );
}
const emptyFilters: Record<string, string> = {
  q: "",
  Cliente: "",
  Cuenta: "",
  Estado: "TODOS",
  Desde: "",
  Hasta: "",
};
export function CurrentAccountPage({
  session,
  onExpired,
}: {
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState(() =>
      initialListFilters(emptyFilters, ["Desde", "Hasta"], "Estado"),
    ),
    [client, setClient] = useState<MasterRecord | null>(null);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [requested, setRequested] = useState(false);
  const [data, setData] = useState<CurrentAccountList | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<{ detail?: CurrentAccountDetail } | null>(null),
    [annulling, setAnnulling] = useState<CurrentAccountDetail | null>(null),
    [filtering, setFiltering] = useState(false);
  const [propertiesKey, setPropertiesKey] = useState<string | null>(null);
  const handler = useRef(onExpired),
    mounted = useRef(true),
    opening = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  handler.current = onExpired;
  const expired = useCallback(() => handler.current(), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function failed(e: unknown) {
    if (e instanceof ApiRequestError && e.status === 401) expired();
    else
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
  }
  useEffect(() => {
    if (!requested) return;
    const request = new AbortController();
    setLoading(true);
    setError("");
    const query = Object.fromEntries(
      Object.entries({ ...filters, pagina: String(page) }).filter(
        ([, value]) => value,
      ),
    );
    void accountList(query, request.signal)
      .then((result) => {
        if (request.signal.aborted) return;
        if (page > 1 && !result.registros.length) {
          setPage(Math.max(1, Math.ceil(result.total / result.limite)));
          return;
        }
        setData(result);
        setSelected((current) =>
          result.registros.some((row) => row.IDTabla === current)
            ? current
            : null,
        );
      })
      .catch((e) => {
        if (!request.signal.aborted) {
          setData(null);
          if (e instanceof ApiRequestError && e.status === 401) expired();
          else
            setError(e instanceof Error ? e.message : "No se pudo consultar.");
        }
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [requested, filters, page, revision, expired]);
  function refresh() {
    setRequested(true);
    setLoading(true);
    setRevision((v) => v + 1);
  }
  function close(refreshData = false) {
    setView(null);
    setAnnulling(null);
    if (refreshData) {
      setSelected(null);
      if (requested) refresh();
    }
    requestAnimationFrame(() => heading.current?.focus());
  }
  const canWrite = session.usuario.rol.codigo === "ADMIN";
  const record =
    !loading && !error
      ? data?.registros.find((row) => row.IDTabla === selected)
      : undefined;
  async function open(row: CurrentAccountRecord | undefined, cancel = false) {
    if (!row || opening.current || loading || busy) return;
    opening.current = true;
    setSelected(row.IDTabla);
    setBusy(true);
    setError("");
    try {
      const detail = await accountDetail(row.IDTabla);
      if (mounted.current) {
        if (cancel) setAnnulling(detail);
        else setView({ detail });
      }
    } catch (e) {
      if (mounted.current) failed(e);
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const columns: TableColumn<CurrentAccountRecord>[] = [
    {
      key: "FechaOrigen",
      label: "Fecha",
      render: (r) => r.FechaOrigen.split("-").reverse().join("/"),
    },
    { key: "Cliente", label: "Cliente", render: (r) => r.ClienteNombre },
    {
      key: "Comprobante",
      label: "Comprobante",
      render: (r) => r.ComprobanteDescripcion,
    },
    { key: "Numero", label: "Número", render: (r) => r.NumeroComprobanteTexto },
    {
      key: "Cuenta",
      label: "Cuenta",
      render: (r) => (r.Cuenta === "COBRAR" ? "Cobrar" : "Pagar"),
    },
    {
      key: "Naturaleza",
      label: "Naturaleza",
      render: (r) => (r.Naturaleza === "DEUDA" ? "Deuda" : "Crédito"),
    },
    { key: "Importe", label: "Importe", render: (r) => amount(r.Importe) },
    {
      key: "Estado",
      label: "Estado",
      render: (r) => (
        <span
          className={`record-status ${r.Estado === "CONFIRMADO" ? "active" : "inactive"}`}
        >
          {r.Estado === "CONFIRMADO" ? "Confirmado" : "Anulado"}
        </span>
      ),
    },
  ];
  const cancellationDialog = annulling ? (
    <CancelMovement
      detail={annulling}
      csrf={session.csrfToken}
      onClose={() => {
        if (view) setAnnulling(null);
        else close();
      }}
      onSaved={() => close(true)}
      onExpired={expired}
    />
  ) : null;
  if (view)
    return (
      <>
        <CurrentAccountForm
          {...(view.detail ? { detail: view.detail } : {})}
          {...(canWrite && view.detail
            ? { onAnnul: () => setAnnulling(view.detail!) }
            : {})}
          csrf={session.csrfToken}
          onClose={() => close()}
          onSaved={() => close(true)}
          onExpired={expired}
        />
        {cancellationDialog}
      </>
    );
  return (
    <>
      <section className="panel master-panel" aria-label="Cuenta corriente">
        <div className="master-toolbar">
          <div>
            <h2 ref={heading} tabIndex={-1}>
              Movimientos
            </h2>
            <p className="muted small">
              Hacé doble clic para consultar. Los movimientos se corrigen
              mediante anulación y nueva carga.
            </p>
          </div>
          <ActionToolbar
            labels={{
              add: "Agregar movimiento",
              edit: "Consultar movimiento",
              remove: "Anular movimiento",
              filter: "Filtrar",
              refresh: "Actualizar listado",
            }}
            selected={Boolean(record)}
            busy={busy}
            readOnly={!canWrite}
            editIcon="eye"
            removeIcon="close"
            removeDisabled={
              record?.Estado !== "CONFIRMADO" || Boolean(record.CajaMovimiento)
            }
            filtersActive={Object.entries(filters).some(
              ([key, value]) => value !== emptyFilters[key],
            )}
            onAdd={() => setView({})}
            onEdit={() => {
              void open(record);
            }}
            onDelete={() => {
              void open(record, true);
            }}
            onProperties={() => {
              if (record && !busy && !loading) setPropertiesKey(record.IDTabla);
            }}
            onFilter={() => setFiltering(true)}
            onRefresh={refresh}
            refreshing={loading}
          />
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <DataTable
          caption="Movimientos de cuenta corriente"
          columns={columns}
          rows={error ? [] : (data?.registros ?? [])}
          rowKey={(r) => r.IDTabla}
          rowLabel={(r) => `${r.NumeroComprobanteTexto} · ${r.ClienteNombre}`}
          loading={loading}
          selectedKey={selected}
          onSelectionChange={setSelected}
          onRowActivate={(row) => {
            void open(row);
          }}
          selectionDisabled={busy}
        />
        {requested && data && (
          <Pagination
            page={page}
            total={data.total}
            limit={data.limite}
            loading={busy || loading}
            onChange={(value) => {
              setPage(value);
              setSelected(null);
              setLoading(true);
            }}
          />
        )}
      </section>
      {propertiesKey !== null && (
        <CurrentAccountProperties
          recordKey={propertiesKey}
          onClose={() => setPropertiesKey(null)}
          onExpired={expired}
        />
      )}
      {filtering && (
        <AccountFilters
          values={filters}
          client={client}
          onClose={() => setFiltering(false)}
          onExpired={expired}
          onApply={(values, selectedClient) => {
            setFilters(values);
            setClient(selectedClient);
            setPage(1);
            setSelected(null);
            refresh();
            setFiltering(false);
          }}
        />
      )}
      {cancellationDialog}
    </>
  );
}
function AccountFilters({
  values,
  client,
  onApply,
  onClose,
  onExpired,
}: {
  values: Record<string, string>;
  client: MasterRecord | null;
  onApply: (
    values: Record<string, string>,
    client: MasterRecord | null,
  ) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [draft, setDraft] = useState({ ...values }),
    [selected, setSelected] = useState(client),
    [reset, setReset] = useState(0);
  const change = (key: string, value: string) =>
    setDraft((v) => ({ ...v, [key]: value }));
  return (
    <Modal title="Filtrar registros" onClose={onClose} busy={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(
            { ...draft, Cliente: selected ? String(selected.Codigo) : "" },
            selected,
          );
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <TextBox
              label="Búsqueda general"
              value={draft.q ?? ""}
              onValueChange={(v) => change("q", v)}
              maxLength={100}
            />
            <ClientSearch
              key={reset}
              label="Cliente"
              value={selected}
              onChange={setSelected}
              onExpired={onExpired}
              historical
            />
            <DropDown
              label="Cuenta"
              value={draft.Cuenta ?? ""}
              options={[
                { value: "", label: "Todas" },
                { value: "COBRAR", label: "Cobrar" },
                { value: "PAGAR", label: "Pagar" },
              ]}
              onValueChange={(v) => change("Cuenta", v)}
            />
            <DropDown
              label="Estado"
              value={draft.Estado ?? "TODOS"}
              options={[
                { value: "TODOS", label: "Todos" },
                { value: "CONFIRMADO", label: "Confirmados" },
                { value: "ANULADO", label: "Anulados" },
              ]}
              onValueChange={(v) => change("Estado", v)}
            />
            {(["Desde", "Hasta"] as const).map((name) => (
              <DatePicker
                key={`${name}-${reset}`}
                label={name === "Desde" ? "Fecha desde" : "Fecha hasta"}
                value={draft[name] ?? ""}
                onValueChange={(value) => change(name, value)}
              />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setDraft({ ...emptyFilters });
              setSelected(null);
              setReset((v) => v + 1);
            }}
          >
            Limpiar
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Aplicar filtros
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CancelMovement({
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  detail: CurrentAccountDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef({ reason: "", key: "" });
  async function submit() {
    if (!reason.trim()) {
      setError("Ingresá un motivo para la anulación.");
      return;
    }
    if (retry.current.reason !== reason)
      retry.current = { reason, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await cancelAccount(detail, reason, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Anular movimiento" busy={busy} onClose={onClose}>
      <div className="modal-body">
        <p>
          Vas a anular {detail.registro.ComprobanteDescripcion}{" "}
          {detail.registro.NumeroComprobanteTexto} de{" "}
          {detail.registro.ClienteNombre}. Se conservará su historia y el número
          no se reutilizará.
        </p>
        <TextArea
          label="Motivo de anulación"
          required
          value={reason}
          onValueChange={setReason}
          maxLength={500}
          disabled={busy}
        />
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          Anular
        </button>
      </div>
    </Modal>
  );
}
