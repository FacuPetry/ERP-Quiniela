import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { masterDefinitions, type SessionResponse } from "@erp/shared";
import { modules, navigate, usePath } from "../navigation";
import { logout } from "../services/auth";
import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { ServiceStatus } from "./ServiceStatus";
import { ActiveCashProvider } from "./cash-movement/ActiveCash";
import { CashPage } from "./cash-movement/CashPage";
import { CurrentAccountPage } from "./current-account/CurrentAccountPage";
import { MasterPage } from "./masters/MasterPage";

function AppLink({
  path,
  onNavigate,
  children,
  ...props
}: {
  path: string;
  onNavigate?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-current"?: "page";
}) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(path);
    onNavigate?.();
  }
  return (
    <a href={path} onClick={follow} {...props}>
      {children}
    </a>
  );
}

function WorkspaceContent({
  session,
  onLogout,
}: {
  session: SessionResponse;
  onLogout: () => void;
}) {
  const path = usePath();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("erp_menu_compacto") === "true";
    } catch {
      return false;
    }
  });
  const [mobile, setMobile] = useState(window.innerWidth <= 860);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sidebar = useRef<HTMLElement | null>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const module = modules.find((item) => item.path === path);
  const master = Object.values(masterDefinitions).find(
    (item) => "/" + item.key === path,
  );
  const isHome = path === "/" || path === "/inicio";
  const isStatus = path === "/sistema";
  const isAccount = path === "/mi-cuenta";
  const title = isHome
    ? "Inicio"
    : isStatus
      ? "Estado del sistema"
      : isAccount
        ? "Mi cuenta"
        : (master?.title ?? module?.title ?? "Página no encontrada");
  const group = module?.group ?? (isHome ? "General" : "Sistema");

  useEffect(() => {
    document.title = `${title} · ERP Quiniela`;
    heading.current?.focus();
  }, [path, title]);
  useEffect(() => {
    const onResize = () => {
      setMobile(window.innerWidth <= 860);
      if (window.innerWidth > 860) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key === "Tab") {
        const items = [
          ...(sidebar.current?.querySelectorAll<HTMLElement>("a,button") ?? []),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      menuButton.current?.focus();
    };
  }, [mobileOpen]);

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await logout(session.csrfToken);
      onLogout();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo cerrar la sesión.",
      );
    } finally {
      setBusy(false);
    }
  }
  function navLink(
    target: string,
    label: string,
    icon: IconName,
    active: boolean,
  ) {
    return (
      <AppLink
        key={target}
        path={target}
        onNavigate={() => setMobileOpen(false)}
        className={`nav-link ${active ? "active" : ""}`}
        {...(collapsed ? { title: label } : {})}
        {...(active ? { "aria-current": "page" as const } : {})}
      >
        <Icon name={icon} />
        <span className="nav-label">{label}</span>
        {active && <span className="nav-active-dot" />}
      </AppLink>
    );
  }
  return (
    <div className={`workspace ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sidebar}
        id="main-navigation"
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        {...(mobileOpen
          ? {
              role: "dialog",
              "aria-modal": true,
              "aria-label": "Menú principal",
            }
          : {})}
      >
        <div className="sidebar-brand">
          <Brand compact={collapsed && !mobileOpen} />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Navegación principal">
          <div className="nav-group">
            <p className="nav-group-label">Espacio de trabajo</p>
            {navLink("/inicio", "Inicio", "home", isHome)}
          </div>
          {["Operaciones", "Maestros"].map((section) => (
            <div className="nav-group" key={section}>
              <p className="nav-group-label">{section}</p>
              {modules
                .filter((item) => item.group === section)
                .map((item) =>
                  navLink(item.path, item.title, item.icon, path === item.path),
                )}
            </div>
          ))}
          <div className="nav-group">
            <p className="nav-group-label">Sistema</p>
            {navLink("/mi-cuenta", "Mi cuenta", "shield", isAccount)}
            {navLink("/sistema", "Estado del sistema", "activity", isStatus)}
          </div>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot online" />
          <span className="nav-label">Etapa 6 · Cobros y pagos</span>
        </div>
      </aside>
      <div className="workspace-body" inert={mobileOpen}>
        <header className="topbar">
          <button
            ref={menuButton}
            className="icon-button menu-toggle"
            aria-label={
              mobile
                ? "Abrir menú"
                : collapsed
                  ? "Expandir menú"
                  : "Contraer menú"
            }
            aria-controls="main-navigation"
            aria-expanded={mobile ? mobileOpen : !collapsed}
            onClick={() => {
              if (mobile) setMobileOpen(!mobileOpen);
              else {
                try {
                  localStorage.setItem("erp_menu_compacto", String(!collapsed));
                } catch {
                  /* Preferencia opcional. */
                }
                setCollapsed(!collapsed);
              }
            }}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>{group}</span>
            <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-account">
            <span className="avatar">
              {session.usuario.nombre.slice(0, 1).toLocaleUpperCase("es-AR")}
            </span>
            <div className="account-summary">
              <strong>{session.usuario.nombre}</strong>
              <span>{session.usuario.rol.nombre}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              disabled={busy}
              onClick={() => {
                void signOut();
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{group}</p>
              <h1 tabIndex={-1} ref={heading}>
                {isHome
                  ? `Hola, ${session.usuario.nombre.split(" ")[0]}`
                  : title}
              </h1>
              <p className="muted">
                {isHome
                  ? "Bienvenido a tu espacio de administración."
                  : (master?.description ??
                    module?.description ??
                    (isStatus
                      ? "Comprobá la disponibilidad de los servicios."
                      : isAccount
                        ? "Información de tu acceso al sistema."
                        : "La dirección que buscás no está disponible."))}
              </p>
            </div>
            <span className="date-label">
              {new Intl.DateTimeFormat("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </span>
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {isHome ? (
            <>
              <section className="welcome-panel">
                <div>
                  <span className="badge light">
                    <Icon name="check" size={14} /> Acceso habilitado
                  </span>
                  <h2>Todo empieza con una buena base.</h2>
                  <p>
                    Consultá la cuenta corriente y administrá los datos de tus
                    clientes, comprobantes, cajas y bancos.
                  </p>
                  <AppLink path="/mi-cuenta" className="text-link">
                    Ver mi cuenta <Icon name="arrow" size={17} />
                  </AppLink>
                </div>
                <div className="welcome-illustration" aria-hidden="true">
                  <div className="illustration-card">
                    <Icon name="account" size={32} />
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="illustration-check">
                    <Icon name="check" size={24} />
                  </span>
                </div>
              </section>
              <section aria-labelledby="shortcuts-title">
                <div className="section-heading">
                  <h2 id="shortcuts-title">Módulos del sistema</h2>
                  <span className="muted small">
                    Cuenta corriente y Cobros y pagos disponibles
                  </span>
                </div>
                <div className="module-grid">
                  {modules
                    .filter((item) => item.group === "Operaciones")
                    .map((item) => (
                      <AppLink
                        key={item.path}
                        path={item.path}
                        className="module-card"
                      >
                        <span className="section-icon">
                          <Icon name={item.icon} size={23} />
                        </span>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <span className="module-card-footer">
                          {["/cuenta-corriente", "/cobros-pagos"].includes(
                            item.path,
                          )
                            ? "Abrir módulo"
                            : "Ver alcance"}{" "}
                          <Icon name="arrow" size={16} />
                        </span>
                      </AppLink>
                    ))}
                </div>
              </section>
              <section
                className="master-shortcuts"
                aria-label="Tablas maestras disponibles"
              >
                <h2>Datos del negocio</h2>
                <div>
                  {Object.values(masterDefinitions).map((item) => (
                    <AppLink
                      key={item.key}
                      path={"/" + item.key}
                      className="button secondary"
                    >
                      {item.title}
                      <Icon name="arrow" size={15} />
                    </AppLink>
                  ))}
                </div>
              </section>
              <ServiceStatus />
            </>
          ) : isStatus ? (
            <ServiceStatus />
          ) : isAccount ? (
            <section className="panel account-panel">
              <div className="panel-heading">
                <div>
                  <h2>Datos de acceso</h2>
                  <p className="muted small">
                    Usuario y perfil de la sesión actual.
                  </p>
                </div>
                <span className="section-icon">
                  <Icon name="shield" />
                </span>
              </div>
              <dl className="account-details">
                <div>
                  <dt>Nombre</dt>
                  <dd>{session.usuario.nombre}</dd>
                </div>
                <div>
                  <dt>Correo electrónico</dt>
                  <dd>{session.usuario.email}</dd>
                </div>
                <div>
                  <dt>Rol</dt>
                  <dd>{session.usuario.rol.nombre}</dd>
                </div>
                <div>
                  <dt>Vencimiento de la sesión</dt>
                  <dd>
                    {new Intl.DateTimeFormat("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(session.venceEn))}
                  </dd>
                </div>
              </dl>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  void signOut();
                }}
              >
                <Icon name="logout" size={17} />
                {busy ? "Cerrando sesión…" : "Cerrar sesión"}
              </button>
            </section>
          ) : path === "/cuenta-corriente" ? (
            <CurrentAccountPage
              key={path}
              session={session}
              onExpired={onLogout}
            />
          ) : path === "/cobros-pagos" ? (
            <CashPage key={path} session={session} onExpired={onLogout} />
          ) : master ? (
            <MasterPage
              key={master.key}
              master={master}
              session={session}
              onExpired={onLogout}
            />
          ) : module ? (
            <section className="panel module-empty">
              <span className="empty-icon">
                <Icon name={module.icon} size={36} />
              </span>
              <span className="badge">Próxima etapa</span>
              <h2>
                El espacio de {module.title.toLocaleLowerCase("es-AR")} ya está
                preparado
              </h2>
              <p>{module.detail}</p>
              <p className="muted small">
                Las consultas, filtros y formularios se incorporarán en las
                siguientes entregas. Este módulo todavía no permite cargar ni
                modificar registros.
              </p>
              <AppLink path="/inicio" className="button secondary">
                Volver al inicio <Icon name="arrow" size={17} />
              </AppLink>
            </section>
          ) : (
            <section className="panel module-empty">
              <Icon name="file" size={40} />
              <h2>No encontramos esta página</h2>
              <AppLink path="/inicio" className="button primary">
                Volver al inicio
              </AppLink>
            </section>
          )}
          <footer className="main-footer">
            <span>ERP Quiniela</span>
            <span>Etapa 6 · Cobros y pagos</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function Workspace(props: {
  session: SessionResponse;
  onLogout: () => void;
}) {
  const key = `erp_caja_${props.session.usuario.id}_${props.session.venceEn}`;
  return (
    <ActiveCashProvider key={key} storageKey={key} onExpired={props.onLogout}>
      <WorkspaceContent {...props} />
    </ActiveCashProvider>
  );
}
