import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../apps/api/src/app.js";
import { newSessionToken, csrfToken } from "../apps/api/src/auth/crypto.js";
import { MasterRequestError } from "../apps/api/src/masters/validation.js";
import type { SessionResponse } from "@erp/shared";

test("Cuenta corriente: un fallo real del servicio deja diagnóstico correlacionado sin exponer datos", async (t) => {
  const token = newSessionToken();
  const session: SessionResponse = {
    usuario: {
      id: "100000001",
      nombre: "Prueba",
      email: "prueba@example.invalid",
      rol: { codigo: "ADMIN", nombre: "Administrador" },
    },
    csrfToken: csrfToken(token),
    venceEn: new Date(Date.now() + 60000).toISOString(),
  };
  const sqlError = Object.assign(
    new Error("mensaje con datos privados del movimiento"),
    {
      code: "ER_BAD_FIELD_ERROR",
      errno: 1054,
      sqlState: "42S22",
      sql: "consulta con valores privados",
      stack:
        "Error: mensaje privado\n at create (/home/usuario/apps/api/dist/current-account/store.js:123:45)",
    },
  );
  let failure: Error = sqlError;
  const fail = async () => {
    throw failure;
  };
  const logs: string[] = [];
  t.mock.method(console, "error", (entry: string) => logs.push(entry));
  const server = createApp({
    checkDatabase: async () => {},
    auth: {
      login: async () => null,
      current: async (raw) => (raw === token ? session : null),
      logout: async () => {},
    },
    currentAccount: {
      options: fail,
      list: fail,
      get: fail,
      create: fail,
      cancel: fail,
    },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${address.port}/api/cuenta-corriente`;
  const input = {
    Cliente: "00002",
    Comprobante: "I",
    Numeracion: "100000001",
    NumeroComprobante: "0001-00000001",
    FechaOrigen: "2026-10-25",
    Vencimiento: "2026-10-25",
    Importe: "10",
    Observacion: null,
  };
  const request = () =>
    fetch(url, {
      method: "POST",
      headers: {
        Cookie: "erp_sesion=" + token,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": session.csrfToken,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(input),
    });
  const response = await request();
  assert.equal(response.status, 500);
  const body = (await response.json()) as { error: string; referencia: string };
  assert.match(body.referencia, /^[a-f0-9-]{36}$/);
  assert.equal(body.error, "No se pudo completar la solicitud.");
  assert.equal(logs.length, 1);
  const entry = JSON.parse(logs[0]!);
  assert.equal(entry.referencia, body.referencia);
  assert.equal(entry.codigo, "ER_BAD_FIELD_ERROR");
  assert.equal(entry.errno, 1054);
  assert.equal(entry.sqlState, "42S22");
  assert.equal(entry.origen, "current-account/store.js:123:45");
  assert.equal(entry.metodo, "POST");
  assert.doesNotMatch(
    JSON.stringify(body) + logs.join(""),
    /privad|00002|usuario\/apps|sql"|prueba@example/,
  );
  failure = new MasterRequestError(409, "El comprobante ya está registrado.");
  const conflict = await request();
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    error: "El comprobante ya está registrado.",
  });
  assert.equal(logs.length, 1);
});
