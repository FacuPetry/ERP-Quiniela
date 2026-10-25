import type { SessionResponse } from "@erp/shared";
import { apiRequest, ApiRequestError } from "./http";
export { ApiRequestError } from "./http";

async function request(path: string, init?: RequestInit) {
  try {
    return await apiRequest<SessionResponse>(`/auth${path}`, init);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status >= 500)
      throw new ApiRequestError(
        "El servicio de acceso no está disponible. Verificá que se hayan aplicado las migraciones y creado el administrador.",
        error.status,
      );
    throw error;
  }
}
export async function currentSession() {
  try {
    return await request("/me");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}
export async function login(email: string, password: string) {
  return request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
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
