import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  menuOptions,
  type SessionResponse,
  type UserRecord,
  type UserDetail,
  type UserInput,
  type UserList,
} from "@erp/shared";
import { apiRequest, ApiRequestError } from "../../services/http";
import { ActionToolbar } from "../ui/ActionToolbar";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { Modal } from "../ui/Modal";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { FormSections } from "../ui/FormSections";
import { useListSorting } from "../ui/useListSorting";
import { TextBox, CheckBox, DropDown } from "../controls";
import { displayDateTime } from "../controls/date-value";
import "./users.css";
const columns: TableColumn<UserRecord>[] = [
  { key: "nombre", label: "Nombre", sort: "nombre", render: (r) => r.nombre },
  {
    key: "email",
    label: "Correo electrónico",
    sort: "email",
    render: (r) => r.email,
  },
  {
    key: "activo",
    label: "Estado",
    sort: "activo",
    render: (r) => (r.activo ? "Activo" : "Inactivo"),
  },
  {
    key: "acceso",
    label: "Acceso",
    render: (r) =>
      r.administrador
        ? "Administrador"
        : `${r.permisos.length} opciones habilitadas`,
  },
];
const fields = [
  ...columns.map((c) => ({ key: c.key, label: c.label, render: c.render })),
  {
    key: "creadoEn",
    label: "Registrado",
    render: (r: UserRecord) => displayDateTime(r.creadoEn),
  },
  {
    key: "permisos",
    label: "Opciones del menú",
    render: (r: UserRecord) =>
      r.administrador
        ? "Acceso completo"
        : r.permisos
            .map(
              (p) =>
                `${menuOptions.find((m) => m.key === p.menu)?.label ?? p.menu}: ${p.escritura ? "consulta y edición" : "consulta"}`,
            )
            .join("\n") || "Sin opciones habilitadas",
  },
];
function writeOptions(
  csrf: string,
  body: unknown,
  method: string,
  version?: string,
): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrf,
      ...(version ? { "If-Match": `"${version}"` } : {}),
    },
    body: JSON.stringify(body),
  };
}
export function UsersPage({
  session,
  onExpired,
}: {
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [query, setQuery] = useState(""),
    [state, setState] = useState("todos"),
    [draft, setDraft] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [requested, setRequested] = useState(false);
  const [data, setData] = useState<UserList | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [view, setView] = useState<{
      detail?: UserDetail;
      readOnly?: boolean;
    } | null>(null),
    [reset, setReset] = useState<UserDetail | null>(null);
  const sorting = useListSorting(setPage);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error ? e.message : "No se pudo completar la operación.",
        );
    },
    [onExpired],
  );
  useEffect(() => {
    if (!requested) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    void apiRequest<UserList>(
      "/usuarios?" +
        new URLSearchParams({
          ...sorting.query,
          q: query,
          estado: state,
          pagina: String(page),
        }),
      { signal: c.signal },
    )
      .then((r) => {
        if (!c.signal.aborted) {
          setData(r);
          setSelected((s) => (r.registros.some((u) => u.id === s) ? s : null));
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          fail(e);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [requested, query, state, page, revision, sorting.value, fail]);
  function refresh() {
    setRequested(true);
    setRevision((v) => v + 1);
  }
  async function open(id: string, resetting = false, readOnly = false) {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      const d = await apiRequest<UserDetail>("/usuarios/" + id);
      if (resetting) setReset(d);
      else setView({ detail: d, readOnly });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function saved(id: string) {
    setView(null);
    setReset(null);
    if (id === session.usuario.id) {
      onExpired();
      return;
    }
    if (requested) refresh();
  }
  const selectedRow = data?.registros.find((r) => r.id === selected);
  if (view)
    return (
      <UserForm
        key={view.detail?.registro.id ?? "new"}
        detail={view.detail}
        readOnly={view.readOnly}
        csrf={session.csrfToken}
        onClose={() => setView(null)}
        onSaved={saved}
        onExpired={onExpired}
      />
    );
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="panel master-panel">
        <DataTable
          caption="Usuarios"
          rows={data?.registros ?? []}
          columns={columns}
          loading={loading}
          rowKey={(r) => r.id}
          rowLabel={(r) => r.nombre}
          selectedKey={selected}
          onSelectionChange={setSelected}
          onRowActivate={(r) => void open(r.id)}
          sort={sorting.value}
          onSortChange={sorting.onChange}
          properties={{ title: "Propiedades · Usuario", fields, onExpired }}
          toolbar={(actions) => (
            <div className="master-toolbar">
              <div>
                <h2>Usuarios</h2>
                <p className="muted small">
                  Administrá el acceso de cada usuario y sus contraseñas.
                </p>
              </div>
              <ActionToolbar
                labels={{}}
                selected={Boolean(selectedRow)}
                busy={busy}
                readOnly={false}
                refreshing={loading}
                filtersActive={Boolean(query) || state !== "todos"}
                onAdd={() => setView({})}
                onEdit={() => selected && void open(selected)}
                onProperties={actions.onProperties}
                onRefresh={refresh}
                endActions={[
                  {
                    key: "observe",
                    label: "Observar usuario",
                    icon: "eye",
                    disabled: !selectedRow,
                    onClick: () => selected && void open(selected, false, true),
                  },
                  {
                    key: "password",
                    label: "Restablecer contraseña",
                    icon: "shield",
                    disabled: !selectedRow,
                    onClick: () => selected && void open(selected, true),
                  },
                ]}
              />
            </div>
          )}
        />
        <form
          className="users-list-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(draft.trim());
            refresh();
          }}
        >
          <TextBox
            id="users-search"
            label="Búsqueda"
            value={draft}
            onValueChange={setDraft}
            placeholder="Nombre o correo"
            size="lg"
            maxLength={100}
          />
          <DropDown
            id="users-state"
            label="Estado"
            size="sm"
            value={state}
            onValueChange={(v) => {
              setState(v);
              setPage(1);
            }}
            options={[
              { value: "todos", label: "Todos" },
              { value: "activo", label: "Activo" },
              { value: "inactivo", label: "Inactivo" },
            ]}
          />
          <button type="submit" className="button secondary" disabled={loading}>
            Filtrar
          </button>
        </form>
        {data && (
          <Pagination
            page={page}
            total={data.total}
            limit={data.limite}
            loading={loading}
            onChange={setPage}
          />
        )}
      </section>
      {reset && (
        <PasswordReset
          detail={reset}
          csrf={session.csrfToken}
          onClose={() => setReset(null)}
          onSaved={() => saved(reset.registro.id)}
          onExpired={onExpired}
        />
      )}
    </>
  );
}
function UserForm({
  detail,
  readOnly = false,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  detail?: UserDetail | undefined;
  readOnly?: boolean | undefined;
  csrf: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onExpired: () => void;
}) {
  const [input, setInput] = useState<UserInput>(() =>
    detail
      ? {
          nombre: detail.registro.nombre,
          email: detail.registro.email,
          activo: detail.registro.activo,
          permisos: detail.registro.permisos,
        }
      : { nombre: "", email: "", activo: true, permisos: [] },
  );
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || busy) return;
    setError("");
    setErrors({});
    if (!detail && password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<UserDetail>(
        "/usuarios" + (detail ? "/" + detail.registro.id : ""),
        writeOptions(
          csrf,
          detail ? input : { ...input, password },
          detail ? "PUT" : "POST",
          detail?.version,
        ),
      );
      setPassword("");
      setRepeat("");
      onSaved(result.registro.id);
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.status === 401) onExpired();
        setErrors(e.campos);
      }
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  const disabled = readOnly || busy;
  return (
    <section className="panel record-form" aria-busy={busy}>
      <div className="form-heading">
        <h2>
          {readOnly
            ? "Consultar usuario"
            : detail
              ? "Modificar usuario"
              : "Nuevo usuario"}
        </h2>
        <FormToolbarActions
          closeAction={
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              {readOnly ? "Cerrar" : "Cancelar"}
            </button>
          }
        >
          {!readOnly && (
            <button
              type="submit"
              form="user-form"
              className="button primary"
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
        </FormToolbarActions>
      </div>
      <form id="user-form" onSubmit={(e) => void submit(e)}>
        <FormSections
          idPrefix="user"
          sections={[
            {
              key: "general",
              title: "Datos generales",
              content: (
                <div className="form-grid">
                  <TextBox
                    id="user-name"
                    label="Nombre"
                    required
                    maxLength={100}
                    value={input.nombre}
                    onValueChange={(nombre) =>
                      setInput((s) => ({ ...s, nombre }))
                    }
                    disabled={disabled}
                    error={errors.nombre}
                  />
                  <TextBox
                    id="user-email"
                    label="Correo electrónico"
                    type="email"
                    required
                    maxLength={150}
                    value={input.email}
                    onValueChange={(email) =>
                      setInput((s) => ({ ...s, email }))
                    }
                    disabled={disabled}
                    error={errors.email}
                  />
                  <CheckBox
                    id="user-active"
                    label="Activo"
                    value={input.activo}
                    onValueChange={(activo) =>
                      setInput((s) => ({ ...s, activo }))
                    }
                    disabled={disabled}
                  />
                  {!detail && (
                    <>
                      <TextBox
                        id="user-password"
                        label="Contraseña"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={password}
                        onValueChange={setPassword}
                        disabled={disabled}
                        error={errors.password}
                        hint="Entre 12 y 128 caracteres. Solo el administrador puede cambiarla."
                      />
                      <TextBox
                        id="user-password-repeat"
                        label="Repetir contraseña"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={repeat}
                        onValueChange={setRepeat}
                        disabled={disabled}
                      />
                    </>
                  )}
                </div>
              ),
            },
            {
              key: "access",
              title: "Acceso al menú",
              content: detail?.registro.administrador ? (
                <p className="notice">
                  El administrador tiene acceso completo. Este formulario no
                  cambia su carácter de administrador.
                </p>
              ) : (
                <div className="user-menu-permissions">
                  <p className="muted small">
                    Configuración individual, sin perfiles. Sin acceso impide
                    entrar al módulo y a su API; Consulta permite leer; Operar
                    habilita también sus acciones. Las búsquedas auxiliares
                    necesarias siguen disponibles dentro de las operaciones
                    autorizadas.
                  </p>
                  {["Operaciones", "Maestros", "Informes", "Sistema"].map(
                    (group) => (
                      <fieldset key={group}>
                        <legend>{group}</legend>
                        {menuOptions
                          .filter((m) => m.group === group)
                          .map((menu) => {
                            const permission = input.permisos.find(
                              (p) => p.menu === menu.key,
                            );
                            return (
                              <DropDown
                                key={menu.key}
                                id={"user-menu-" + menu.key}
                                label={menu.label}
                                size="md"
                                value={
                                  !permission
                                    ? "none"
                                    : permission.escritura
                                      ? "write"
                                      : "read"
                                }
                                disabled={disabled}
                                onValueChange={(v) =>
                                  setInput((s) => ({
                                    ...s,
                                    permisos: [
                                      ...s.permisos.filter(
                                        (p) => p.menu !== menu.key,
                                      ),
                                      ...(v === "none"
                                        ? []
                                        : [
                                            {
                                              menu: menu.key,
                                              escritura: v === "write",
                                            },
                                          ]),
                                    ],
                                  }))
                                }
                                options={[
                                  { value: "none", label: "Sin acceso" },
                                  { value: "read", label: "Consulta" },
                                  ...(group === "Informes" ||
                                  group === "Sistema"
                                    ? []
                                    : [{ value: "write", label: "Operar" }]),
                                ]}
                              />
                            );
                          })}
                      </fieldset>
                    ),
                  )}
                  {errors.permisos && (
                    <p className="notice error">{errors.permisos}</p>
                  )}
                </div>
              ),
            },
          ]}
        />
        {error && (
          <p className="notice error user-form-message" role="alert">
            {error}
          </p>
        )}
        {detail && !readOnly && (
          <p className="muted small user-form-message">
            Al guardar se cerrarán las sesiones de este usuario para actualizar
            su acceso. Para cambiar la contraseña utilizá la acción del listado.
          </p>
        )}
      </form>
    </section>
  );
}
function PasswordReset({
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  detail: UserDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(
        "/usuarios/" + detail.registro.id + "/clave",
        writeOptions(csrf, { password }, "POST", detail.version),
      );
      setPassword("");
      setRepeat("");
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "No se pudo restablecer.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Restablecer contraseña" onClose={onClose} busy={busy}>
      <form onSubmit={(e) => void submit(e)}>
        <p className="muted small">
          Usuario: {detail.registro.nombre}. Se cerrarán todas sus sesiones.
          Compartí la contraseña por un canal privado.
        </p>
        <div className="password-reset-fields">
          <TextBox
            id="reset-password"
            type="password"
            label="Nueva contraseña"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            disabled={busy}
          />
          <TextBox
            id="reset-password-repeat"
            type="password"
            label="Repetir contraseña"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={repeat}
            onValueChange={setRepeat}
            disabled={busy}
          />
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Guardando…" : "Confirmar"}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
