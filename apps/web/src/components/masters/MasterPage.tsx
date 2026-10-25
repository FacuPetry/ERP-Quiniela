import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MasterDefinition,
  MasterDetail,
  MasterList,
  MasterRecord,
  SessionResponse,
} from "@erp/shared";
import { masterRecordKey } from "@erp/shared";
import { deleteMaster, getMaster, listMasters } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { Modal } from "../ui/Modal";
import { ActionToolbar } from "../ui/ActionToolbar";
import { FilterDialog, type FilterField } from "../ui/FilterDialog";
import { MasterForm } from "./MasterForm";

const defaultFilters = { q: "", estado: "todos", referencia: "" };

export function MasterPage({
  master,
  session,
  onExpired,
}: {
  master: MasterDefinition;
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({
    ...defaultFilters,
  });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<MasterList | null>(null);
  const [hasRequestedList, setHasRequestedList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<{ detail?: MasterDetail } | null>(null);
  const [deleting, setDeleting] = useState<MasterDetail | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canWrite = session.usuario.rol.codigo === "ADMIN";
  const relation = master.fields.find((field) => field.kind === "relation");
  const expiredHandler = useRef(onExpired);
  useEffect(() => {
    expiredHandler.current = onExpired;
  }, [onExpired]);
  const expired = useCallback(() => expiredHandler.current(), []);
  const listBusy = loading;
  const selectedRecord =
    !listBusy && !error
      ? data?.registros.find((row) => masterRecordKey(master, row) === selected)
      : undefined;
  const filterFields: FilterField[] = [
    { key: "q", label: "Búsqueda general", kind: "text" },
    {
      key: "estado",
      label: "Estado",
      kind: "select",
      options: [
        { value: "todos", label: "Todos" },
        { value: "activo", label: "Activos" },
        { value: "inactivo", label: "Inactivos" },
      ],
    },
    ...(relation
      ? [
          {
            key: "referencia",
            label: relation.label,
            kind: "relation" as const,
            reference: relation,
          },
        ]
      : []),
  ];
  const filtersActive =
    filters.estado !== "todos" ||
    Boolean(filters.referencia) ||
    Boolean(filters.q?.trim());
  useEffect(() => {
    if (!hasRequestedList) return;
    const request = new AbortController();
    setLoading(true);
    setError("");
    void listMasters(
      master.key,
      {
        q: filters.q?.trim() ?? "",
        estado: filters.estado ?? "todos",
        pagina: String(page),
        ...(filters.referencia ? { referencia: filters.referencia } : {}),
      },
      request.signal,
    )
      .then((result) => {
        if (request.signal.aborted) return;
        if (page > 1 && !result.registros.length) {
          setPage(Math.max(1, Math.ceil(result.total / result.limite)));
          return;
        }
        setData(result);
        setSelected((current) =>
          result.registros.some(
            (row) => masterRecordKey(master, row) === current,
          )
            ? current
            : null,
        );
      })
      .catch((error) => {
        if (request.signal.aborted) return;
        setData(null);
        if (error instanceof ApiRequestError && error.status === 401) expired();
        else
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el listado.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [master.key, filters, page, revision, expired, hasRequestedList]);
  function requestList() {
    setHasRequestedList(true);
    setLoading(true);
    setRevision((value) => value + 1);
  }
  async function open(action: "form" | "delete", record = selectedRecord) {
    if (!record || busy || opening.current || listBusy || error) return;
    opening.current = true;
    setSelected(masterRecordKey(master, record));
    setBusy(true);
    setError("");
    try {
      const detail = await getMaster(
        master.key,
        masterRecordKey(master, record),
      );
      if (!mounted.current) return;
      if (action === "form") setView({ detail });
      else setDeleting(detail);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiRequestError && error.status === 401) expired();
      else
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo abrir el registro.",
        );
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function returnToList(refresh = false) {
    setView(null);
    setDeleting(null);
    if (refresh) {
      setSelected(null);
      if (hasRequestedList) requestList();
    }
    requestAnimationFrame(() => listHeading.current?.focus());
  }
  const columns: TableColumn<MasterRecord>[] = [
    ...master.columns.map((key) => ({
      key,
      label: master.fields.find((field) => field.name === key)!.label,
      render: (row: MasterRecord) => {
        const description = data?.descripciones?.[key]?.[String(row[key])];
        const option = master.fields
          .find((field) => field.name === key)
          ?.options?.find((item) => item.value === row[key]);
        const value =
          typeof description === "string" && description
            ? description
            : (option?.label ?? row[key]);
        return (
          <span
            className={
              key === (master.primaryKey ?? "Codigo") ? "record-code" : ""
            }
          >
            {value ? String(value) : "—"}
          </span>
        );
      },
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
  if (view)
    return (
      <MasterForm
        master={master}
        {...(view.detail ? { previous: view.detail } : {})}
        csrf={session.csrfToken}
        readOnly={!canWrite}
        onClose={() => returnToList()}
        onSaved={() => returnToList(true)}
        onExpired={expired}
      />
    );
  return (
    <section
      className="panel master-panel"
      aria-label={`Administración de ${master.title.toLocaleLowerCase("es-AR")}`}
    >
      <div className="master-toolbar">
        <div>
          <h2 ref={listHeading} tabIndex={-1}>
            {master.title}
          </h2>
          <p className="muted small">
            {canWrite
              ? "Seleccioná un registro para usar las acciones o hacé doble clic para modificarlo."
              : "Seleccioná un registro o hacé doble clic para consultar sus datos."}
          </p>
        </div>
        <ActionToolbar
          labels={{
            add: `Agregar ${master.singular}`,
            edit: `${canWrite ? "Modificar" : "Consultar"} ${master.singular}`,
            remove: `Eliminar ${master.singular}`,
            filter: "Filtrar",
            refresh: "Actualizar listado",
          }}
          selected={Boolean(selectedRecord)}
          busy={busy}
          readOnly={!canWrite}
          filtersActive={filtersActive}
          onAdd={() => {
            setView({});
          }}
          onEdit={() => {
            void open("form");
          }}
          onDelete={() => {
            void open("delete");
          }}
          onFilter={() => setFilterOpen(true)}
          onRefresh={requestList}
          refreshing={loading}
        />
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <DataTable
        caption={`Listado de ${master.title.toLocaleLowerCase("es-AR")}`}
        columns={columns}
        rows={error ? [] : (data?.registros ?? [])}
        rowKey={(row) => masterRecordKey(master, row)}
        loading={listBusy}
        emptyMessage={
          !hasRequestedList
            ? "No hay registros para mostrar."
            : error
              ? "No se pudo completar la búsqueda. Intentá actualizar el listado."
              : undefined
        }
        selectionDisabled={busy}
        selectedKey={selected}
        onSelectionChange={setSelected}
        onRowActivate={(row) => {
          void open("form", row);
        }}
      />
      <span className="sr-only" role="status">
        {selectedRecord
          ? `Registro seleccionado: ${masterRecordKey(master, selectedRecord)}.`
          : "Ningún registro seleccionado."}
      </span>
      {hasRequestedList && data && (
        <Pagination
          page={page}
          total={data?.total ?? 0}
          limit={20}
          loading={listBusy || busy}
          onChange={(value) => {
            setPage(value);
            setSelected(null);
            setLoading(true);
          }}
        />
      )}
      {filterOpen && (
        <FilterDialog
          fields={filterFields}
          values={filters}
          defaults={defaultFilters}
          onApply={(values) => {
            setFilters(values);
            setPage(1);
            setSelected(null);
            requestList();
            setFilterOpen(false);
          }}
          onClose={() => setFilterOpen(false)}
          onExpired={expired}
        />
      )}
      {deleting && (
        <DeleteDialog
          master={master}
          detail={deleting}
          csrf={session.csrfToken}
          onClose={() => setDeleting(null)}
          onDeleted={() => returnToList(true)}
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
          Vas a eliminar el registro{" "}
          <strong>{masterRecordKey(master, detail.registro)}</strong> ·{" "}
          {String(
            detail.registro.Nombre ??
              detail.registro.Descripcion ??
              detail.registro.Serie ??
              "",
          )}
          .
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
