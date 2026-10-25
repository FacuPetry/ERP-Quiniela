import { useEffect, useRef, useState } from "react";
import { getServiceStatus } from "../services/status";
import { Icon } from "./Icon";

export function ServiceStatus() {
  const [status, setStatus] = useState<{
    api: boolean;
    database: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const request = useRef<AbortController | null>(null);
  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    const result = await getServiceStatus(
      AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    );
    if (controller.signal.aborted) return;
    setStatus(result);
    setCheckedAt(new Date());
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, []);
  return (
    <section
      className="panel"
      aria-labelledby="services-title"
      aria-busy={loading}
    >
      <div className="panel-heading">
        <div>
          <h2 id="services-title">Estado del sistema</h2>
          <p className="muted small">
            Disponibilidad de la aplicación y sus servicios.
          </p>
        </div>
        <span className="section-icon small-icon">
          <Icon name="activity" />
        </span>
      </div>
      <div className="service-grid">
        {[
          { title: "Aplicación web", ok: true },
          { title: "Servidor", ok: status?.api },
          { title: "Base de datos", ok: status?.database },
        ].map((item) => (
          <div className="service-item" key={item.title}>
            <span
              className={`status-dot ${item.ok ? "online" : loading ? "pending" : "offline"}`}
            />
            <div>
              <strong>{item.title}</strong>
              <p>
                {item.title === "Aplicación web"
                  ? "Disponible"
                  : loading
                    ? "Comprobando…"
                    : item.ok
                      ? "Conectado"
                      : "Sin conexión"}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="status-actions">
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => {
            void refresh();
          }}
        >
          {loading ? "Verificando…" : "Verificar conexión"}
        </button>
        <span className="muted small" role="status">
          {checkedAt
            ? `Última comprobación: ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(checkedAt)}`
            : "Consultando servicios…"}
        </span>
      </div>
      <p className="muted small status-note">
        La conexión confirma el acceso al servidor de base de datos. Las tablas
        se preparan mediante las migraciones.
      </p>
    </section>
  );
}
