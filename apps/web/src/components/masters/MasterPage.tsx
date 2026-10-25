import { useCallback, useEffect, useState } from "react";
import type {
  MasterDefinition,
  MasterDetail,
  MasterList,
  MasterRecord,
  SessionResponse,
} from "@erp/shared";
import { deleteMaster, getMaster, listMasters } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { Modal } from "../ui/Modal";
import { MasterForm } from "./MasterForm";
import { ReferenceSelect } from "./ReferenceSelect";

export function MasterPage({
  master,
  session,
  onExpired,
}: {
  master: MasterDefinition;
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("todos");
  const [reference, setReference] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<MasterList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{
    action: "form" | "delete";
    detail?: MasterDetail;
  } | null>(null);
  const canWrite = session.usuario.rol.codigo === "ADMIN";
  const relation = master.fields.find((field) => field.kind === "relation");
  const expired = useCallback(() => onExpired(), [onExpired]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void listMasters(
      master.key,
      {
        q: query,
        estado: state,
        pagina: String(page),
        ...(reference ? { referencia: reference } : {}),
      },
      request.signal,
    )
      .then((result) => {
        if (request.signal.aborted) return;
        if (page > 1 && result.registros.length === 0) {
          setPage(Math.max(1, Math.ceil(result.total / result.limite)));
          return;
        }
        setData(result);
      })
      .catch((error) => {
        if (!request.signal.aborted) {
          if (error instanceof ApiRequestError && error.status === 401)
            expired();
          else
            setError(
              error instanceof Error
                ? error.message
                : "No se pudo cargar el listado.",
            );
        }
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [master.key, query, state, reference, page, revision, expired]);
  async function open(record: MasterRecord, action: "form" | "delete") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setDialog({ action, detail: await getMaster(master.key, record.Codigo) });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) expired();
      else
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo abrir el registro.",
        );
    } finally {
      setBusy(false);
    }
  }
  function saved(message: string) {
    setDialog(null);
    setNotice(message);
    setRevision((value) => value + 1);
  }
  const columns: TableColumn<MasterRecord>[] = [
    ...master.columns.map((key) => ({
      key,
      label: master.fields.find((field) => field.name === key)!.label,
      render: (row: MasterRecord) => (
        <span className={key === "Codigo" ? "record-code" : ""}>
          {row[key] ? String(row[key]) : "—"}
        </span>
      ),
    })),
    {
      key: "Activo",
      label: "Estado",
      render: (row) => (
        <span className={`record-status ${row.Activo ? "active" : "inactive"}`}>
          {row.Activo ? "Activo" : "Inactivo"}
        </span>
      ),
    },
  ];
  return (
    <section
      className="panel master-panel"
      aria-label={`Administración de ${master.title.toLocaleLowerCase("es-AR")}`}
    >
      <div className="master-toolbar">
        <div>
          <h2>{master.title}</h2>
          <p className="muted small">
            {canWrite
              ? "Administrá los registros de este maestro."
              : "Tu perfil permite consultar los registros."}
          </p>
        </div>
        {canWrite && (
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setNotice("");
              setDialog({ action: "form" });
            }}
          >
            + {master.feminine ? 'Nueva' : 'Nuevo'} {master.singular}
          </button>
        )}
      </div>
      <div className="list-filters">
        <div className="filter-search">
          <label htmlFor="master-search">Buscar</label>
          <input
            id="master-search"
            type="search"
            placeholder="Código, nombre u otros datos…"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="master-state">Estado</label>
          <select
            id="master-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        {relation && (
          <div className="filter-reference">
            <label htmlFor="master-reference">{relation.label}</label>
            <ReferenceSelect
              field={relation}
              id="master-reference"
              value={reference}
              filter
              onChange={(value) => {
                setReference(value);
                setPage(1);
              }}
              onExpired={expired}
            />
          </div>
        )}
        <button
          type="button"
          className="button secondary refresh-list"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Actualizar
        </button>
      </div>
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <DataTable
        caption={`Listado de ${master.title.toLocaleLowerCase("es-AR")}`}
        columns={columns}
        rows={error ? [] : (data?.registros ?? [])}
        rowKey={(row) => row.Codigo}
        loading={loading}
        actions={(row) => (
          <>
            <button
              type="button"
              className="table-action"
              disabled={loading || busy}
              aria-label={`${canWrite ? "Modificar" : "Consultar"} ${row.Codigo}`}
              onClick={() => {
                void open(row, "form");
              }}
            >
              {canWrite ? "Modificar" : "Consultar"}
            </button>
            {canWrite && (
              <button
                type="button"
                className="table-action danger-text"
                disabled={loading || busy}
                aria-label={`Eliminar ${row.Codigo}`}
                onClick={() => {
                  void open(row, "delete");
                }}
              >
                Eliminar
              </button>
            )}
          </>
        )}
      />
      <Pagination
        page={page}
        total={data?.total ?? 0}
        limit={20}
        loading={loading}
        onChange={setPage}
      />
      {dialog?.action === "form" && (
        <MasterForm
          master={master}
          {...(dialog.detail ? { previous: dialog.detail } : {})}
          csrf={session.csrfToken}
          readOnly={!canWrite}
          onClose={() => setDialog(null)}
          onSaved={() => saved("Registro guardado correctamente.")}
          onExpired={expired}
        />
      )}
      {dialog?.action === "delete" && dialog.detail && (
        <DeleteDialog
          master={master}
          detail={dialog.detail}
          csrf={session.csrfToken}
          onClose={() => setDialog(null)}
          onDeleted={() => saved("Registro eliminado correctamente.")}
          onExpired={expired}
        />
      )}
    </section>
  );
}

function DeleteDialog({
  master,
  detail,
  csrf,
  onClose,
  onDeleted,
  onExpired,
}: {
  master: MasterDefinition;
  detail: MasterDetail;
  csrf: string;
  onClose: () => void;
  onDeleted: () => void;
  onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteMaster(master.key, detail, csrf);
      onDeleted();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) onExpired();
      else
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el registro.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Eliminar ${master.singular}`} onClose={onClose} busy={busy}>
      <div className="modal-body">
        <p>
          Vas a eliminar el registro <strong>{detail.registro.Codigo}</strong> ·{" "}
          {String(detail.registro.Nombre ?? detail.registro.Descripcion)}.
        </p>
        <p className="muted small">
          La eliminación es permanente. Si el registro está utilizado por otros
          datos, se conservará y podrás desactivarlo desde Modificar.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
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
          className="button danger"
          disabled={busy}
          onClick={() => {
            void remove();
          }}
        >
          {busy ? "Eliminando…" : "Eliminar registro"}
        </button>
      </div>
    </Modal>
  );
}
