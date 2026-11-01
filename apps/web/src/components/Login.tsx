import { useState, type FormEvent } from "react";
import type { SessionResponse } from "@erp/shared";
import { login } from "../services/auth";
import { Brand } from "./Brand";
import { Icon } from "./Icon";

export function Login({
  onLogin,
}: {
  onLogin: (session: SessionResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await login(email, password);
      setPassword("");
      onLogin(session);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo ingresar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story" aria-label="ERP Quiniela">
        <Brand />
        <div className="login-story-content">
          <span className="eyebrow">ADMINISTRACIÓN Y TESORERÍA</span>
          <h1>
            Tu operación,
            <br />
            en un solo lugar.
          </h1>
          <p>
            Organizá las cuentas de tus clientes y el movimiento de tus fondos
            con una visión clara de tu negocio.
          </p>
          <div className="login-story-tags">
            <span>Cuenta corriente</span>
            <span>Cobros y pagos</span>
            <span>Tesorería</span>
          </div>
        </div>
        <p className="login-caption">ERP Quiniela · Espacio de trabajo</p>
      </section>
      <section className="login-form-section" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <span className="section-icon">
            <Icon name="shield" size={25} />
          </span>
          <p className="eyebrow">BIENVENIDO</p>
          <h2 id="login-title">Ingresá a tu cuenta</h2>
          <p className="muted">Usá tu correo y contraseña para continuar.</p>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
            aria-busy={busy}
          >
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              maxLength={150}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@tuempresa.com"
              disabled={busy}
            />
            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={
                  visible ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                <Icon name="eye" />
              </button>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary login-submit"
              disabled={busy}
              type="submit"
            >
              {busy ? "Ingresando…" : "Ingresar"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="login-help">
            ¿Todavía no tenés acceso? Contactá al administrador del sistema.
          </p>
        </div>
      </section>
    </main>
  );
}
