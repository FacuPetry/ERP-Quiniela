import type { SessionResponse } from "@erp/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiRequestError(
      "No pudimos comunicarnos con el servidor. Revisá tu conexión e intentá nuevamente.",
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiRequestError(
      response.status >= 500
        ? "El servicio de acceso no está disponible. Verificá que se hayan aplicado las migraciones y creado el administrador."
        : (body?.error ?? "No se pudo completar la solicitud."),
      response.status,
    );
  }
  return response;
}
export async function currentSession() {
  try {
    return (await (await request("/me")).json()) as SessionResponse;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}
export async function login(email: string, password: string) {
  return (await (
    await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({ email: email.trim(), password }),
    })
  ).json()) as SessionResponse;
}
export async function logout(csrfToken: string) {
  await request("/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ERP-Request": "1",
      "X-CSRF-Token": csrfToken,
    },
    body: "{}",
  });
}
