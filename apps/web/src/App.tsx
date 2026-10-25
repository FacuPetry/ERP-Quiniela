import { useCallback, useEffect, useState } from "react";
import type { SessionResponse } from "@erp/shared";
import { currentSession } from "./services/auth";
import { Login } from "./components/Login";
import { Workspace } from "./components/Workspace";
import { Brand } from "./components/Brand";

export function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSession(await currentSession());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo verificar la sesión.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // La API es la autoridad. No persistir credenciales ni sesiones en localStorage.
  useEffect(() => {
    if (!session) {
      document.title = "Ingresar · ERP Quiniela";
      return;
    }
    let cancelled = false;
    async function revalidate() {
      if (document.visibilityState === "hidden") return;
      try {
        const current = await currentSession();
        if (!cancelled) {
          setSession(current);
          setError("");
        }
      } catch {
        if (!cancelled)
          setError(
            "No pudimos verificar la sesión. Revisá la conexión con el servidor.",
          );
      }
    }
    const interval = window.setInterval(() => {
      void revalidate();
    }, 60000);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [session?.usuario.id, session?.venceEn]);
  if (loading)
    return (
      <main className="loading-page">
        <Brand />
        <p role="status">Comprobando tu sesión…</p>
      </main>
    );
  if (error && !session)
    return (
      <main className="loading-page">
        <Brand />
        <p className="notice error" role="alert">
          {error}
        </p>
        <button
          className="button primary"
          onClick={() => {
            void refresh();
          }}
        >
          Volver a intentar
        </button>
      </main>
    );
  if (!session) return <Login onLogin={setSession} />;
  return (
    <>
      {error && (
        <div className="connection-notice" role="alert">
          {error}
        </div>
      )}
      <Workspace
        session={session}
        onLogout={() => {
          setSession(null);
          setError("");
        }}
      />
    </>
  );
}
