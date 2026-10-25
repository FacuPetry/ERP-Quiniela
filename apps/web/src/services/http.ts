export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly campos: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
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
      campos?: Record<string, string>;
    } | null;
    throw new ApiRequestError(
      response.status >= 500
        ? "No se pudo completar la operación. Intentá nuevamente en unos momentos."
        : (body?.error ?? "No se pudo completar la solicitud."),
      response.status,
      body?.campos,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
