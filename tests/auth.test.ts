import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../apps/api/src/app.js";
import {
  csrfToken,
  equalToken,
  hashPassword,
  tokenHash,
  verifyPassword,
} from "../apps/api/src/auth/crypto.js";
import { createAuthService } from "../apps/api/src/auth/service.js";
import type { Account, AuthStore } from "../apps/api/src/auth/store.js";
import type { SessionResponse } from "@erp/shared";

test("Claves: scrypt con sal, comparación y parámetros acotados", async () => {
  const password = "Una clave de prueba larga";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword("otra contraseña", first), false);
  assert.equal(
    await verifyPassword(password, "scrypt$999999999$8$1$corrupto"),
    false,
  );
  assert.equal(equalToken("ñ".repeat(64), "a".repeat(64)), false);
});

test("HTTP de acceso: cookies, revocación, vencimiento y solicitudes ajenas", async (t) => {
  const password = "Una clave larga para la prueba";
  const account: Account = {
    usuario: {
      id: "100000001",
      nombre: "Administrador de prueba",
      email: "admin@example.invalid",
      rol: { codigo: "ADMIN", nombre: "Administrador" },
    },
    claveHash: await hashPassword(password),
    activo: true,
    rolActivo: true,
  };
  let now = new Date("2026-10-25T00:00:00Z");
  const records = new Map<
    string,
    { userId: string; expires: Date; revoked: boolean }
  >();
  const store: AuthStore = {
    async findAccount(email) {
      return email === account.usuario.email ? account : null;
    },
    async createSession(userId, hash, _created, expires) {
      records.set(hash, { userId, expires, revoked: false });
    },
    async findSession(hash, clock) {
      const value = records.get(hash);
      return value &&
        !value.revoked &&
        value.expires > clock &&
        account.activo &&
        account.rolActivo
        ? { usuario: account.usuario, venceEn: value.expires }
        : null;
    },
    async revokeSession(hash) {
      const value = records.get(hash);
      if (value) value.revoked = true;
    },
  };
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(store, () => now),
    secureCookie: true,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const headers = { "Content-Type": "application/json", "X-ERP-Request": "1" };
  const post = (
    path: string,
    body: unknown,
    extra: Record<string, string> = {},
  ) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  let cookie = "";
  let session: SessionResponse;

  await t.test(
    "sin cookie no se accede al usuario; no se permite CORS",
    async () => {
      const response = await fetch(`${base}/me`, {
        headers: { Origin: "https://otro.example" },
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    },
  );
  await t.test(
    "el ingreso exige JSON y encabezado propio; bloquea cross-site",
    async () => {
      const body = JSON.stringify({ email: account.usuario.email, password });
      assert.equal(
        (
          await fetch(`${base}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            "/login",
            { email: account.usuario.email, password },
            { "Sec-Fetch-Site": "cross-site" },
          )
        ).status,
        403,
      );
      assert.equal(records.size, 0);
    },
  );
  await t.test(
    "credenciales incorrectas y usuario inexistente reciben el mismo mensaje",
    async () => {
      const first = await post("/login", {
        email: account.usuario.email,
        password: "incorrecta",
      });
      const second = await post("/login", {
        email: "no-existe@example.invalid",
        password,
      });
      assert.equal(first.status, 401);
      assert.equal(second.status, 401);
      assert.deepEqual(await first.json(), await second.json());
    },
  );
  await t.test(
    "ingreso crea cookie HttpOnly/Secure y guarda solamente el hash del token",
    async () => {
      const response = await post("/login", {
        email: "ADMIN@EXAMPLE.INVALID",
        password,
      });
      assert.equal(response.status, 200);
      const setCookie = response.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Lax/);
      assert.match(setCookie, /Path=\//);
      cookie = setCookie.split(";")[0]!;
      session = (await response.json()) as SessionResponse;
      assert.equal(session.usuario.id, "100000001");
      const rawToken = cookie.split("=")[1]!;
      assert.ok(records.has(tokenHash(rawToken)));
      assert.equal(records.has(rawToken), false);
      assert.equal(session.csrfToken, csrfToken(rawToken));
      assert.equal(JSON.stringify(session).includes("ClaveHash"), false);
      assert.equal(JSON.stringify(session).includes(rawToken), false);
    },
  );
  await t.test(
    "recuperar la sesión no extiende su vencimiento y una cookie alterada falla",
    async () => {
      const response = await fetch(`${base}/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), session);
      assert.equal(
        (
          await fetch(`${base}/me`, {
            headers: { Cookie: `erp_sesion=${"x".repeat(43)}` },
          })
        ).status,
        401,
      );
    },
  );
  await t.test(
    "cerrar sesión exige CSRF y revoca la cookie en la base",
    async () => {
      assert.equal((await post("/logout", {}, { Cookie: cookie })).status, 403);
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status,
        200,
      );
      const response = await post(
        "/logout",
        {},
        { Cookie: cookie, "X-CSRF-Token": session.csrfToken },
      );
      assert.equal(response.status, 204);
      assert.match(
        response.headers.get("set-cookie")!,
        /Expires=Thu, 01 Jan 1970/,
      );
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status,
        401,
      );
    },
  );
  await t.test(
    "reingresar rota el token y revoca la sesión anterior del navegador",
    async () => {
      const first = await post("/login", {
        email: account.usuario.email,
        password,
      });
      const oldCookie = first.headers.get("set-cookie")!.split(";")[0]!;
      const second = await post(
        "/login",
        { email: account.usuario.email, password },
        { Cookie: oldCookie },
      );
      cookie = second.headers.get("set-cookie")!.split(";")[0]!;
      assert.notEqual(cookie, oldCookie);
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: oldCookie } })).status,
        401,
      );
    },
  );
  await t.test(
    "desactivar usuario o rol invalida sesiones; el vencimiento se controla en servidor",
    async () => {
      account.activo = false;
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status,
        401,
      );
      assert.equal(
        (await post("/login", { email: account.usuario.email, password }))
          .status,
        401,
      );
      account.activo = true;
      account.rolActivo = false;
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status,
        401,
      );
      account.rolActivo = true;
      now = new Date("2026-10-25T08:00:01Z");
      assert.equal(
        (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status,
        401,
      );
    },
  );
  await t.test(
    "limita intentos repetidos sin mostrar datos internos",
    async () => {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 11; attempt++)
        response = await post("/login", {
          email: "limite@example.invalid",
          password: "incorrecta",
        });
      assert.equal(response!.status, 429);
      assert.ok(Number(response!.headers.get("retry-after")) > 0);
    },
  );
});
