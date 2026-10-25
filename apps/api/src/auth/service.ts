import type { SessionResponse } from "@erp/shared";
import {
  csrfToken,
  dummyPasswordHash,
  newSessionToken,
  tokenHash,
  verifyPassword,
} from "./crypto.js";
import type { AuthStore } from "./store.js";

export const sessionLifetimeMs = 8 * 60 * 60 * 1000;

export function createAuthService(store: AuthStore, now = () => new Date()) {
  return {
    async login(email: string, password: string) {
      const account = await store.findAccount(email.trim().toLowerCase());
      const correct = await verifyPassword(
        password,
        account?.claveHash ?? dummyPasswordHash,
      );
      if (!account || !correct || !account.activo || !account.rolActivo)
        return null;
      const token = newSessionToken();
      const created = now();
      const expires = new Date(created.getTime() + sessionLifetimeMs);
      await store.createSession(
        account.usuario.id,
        tokenHash(token),
        created,
        expires,
      );
      return {
        token,
        session: {
          usuario: account.usuario,
          csrfToken: csrfToken(token),
          venceEn: expires.toISOString(),
        } satisfies SessionResponse,
      };
    },
    async current(token: string): Promise<SessionResponse | null> {
      const session = await store.findSession(tokenHash(token), now());
      return session
        ? {
            usuario: session.usuario,
            csrfToken: csrfToken(token),
            venceEn: session.venceEn.toISOString(),
          }
        : null;
    },
    async logout(token: string) {
      await store.revokeSession(tokenHash(token), now());
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
