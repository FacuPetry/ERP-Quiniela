import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  MasterDetail,
  MasterList,
  MasterRecord,
  SessionResponse,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";

test("Maestros: API autenticada y persistencia en base aislada", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("base64url");
  const hash = await hashPassword(password);
  await pool.execute(
    "INSERT IGNORE INTO ROL (Codigo, Nombre) VALUES ('ADMIN', 'Administrador'), ('OPERADOR', 'Operador')",
  );
  for (const role of ["ADMIN", "OPERADOR"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre, Email, ClaveHash, Rol, CreadoEn) VALUES (?, ?, ?, ?, ?)",
      [
        role,
        `${role.toLowerCase()}-maestros@example.invalid`,
        hash,
        role,
        new Date(),
      ],
    );
  const server = createApp({
    checkDatabase: async () => {
      await pool.query("SELECT 1");
    },
    auth: createAuthService(createAuthStore(pool)),
    masters: createMasterStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await pool.end();
  });
  async function signIn(role: string) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({
        email: `${role.toLowerCase()}-maestros@example.invalid`,
        password,
      }),
    });
    assert.equal(response.status, 200);
    return {
      session: (await response.json()) as SessionResponse,
      cookie: response.headers.get("set-cookie")!.split(";")[0]!,
    };
  }
  const admin = await signIn("ADMIN");
  const reader = await signIn("OPERADOR");
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    version?: string,
  ) {
    return fetch(`${base}/api/maestros/${path}`, {
      method,
      headers: {
        Cookie: admin.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": admin.session.csrfToken,
        ...(version ? { "If-Match": '"' + version + '"' } : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  }
  async function create(path: string, data: Record<string, unknown>) {
    const response = await request(path, "POST", { Activo: true, ...data });
    assert.equal(response.status, 201, await response.clone().text());
    const result = (await response.json()) as MasterDetail;
    assert.equal(response.headers.get("etag"), '"' + result.version + '"');
    return result;
  }
  async function get(path: string) {
    const response = await request(path);
    assert.equal(response.status, 200);
    return (await response.json()) as MasterDetail;
  }
  async function update(path: string, data: MasterRecord, version: string) {
    const response = await request(path, "PUT", data, version);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as MasterDetail;
  }

  await t.test(
    "sin sesión no hay acceso; consulta para operador y escritura solo ADMIN con CSRF",
    async () => {
      assert.equal((await fetch(`${base}/api/maestros/clientes`)).status, 401);
      assert.equal(
        (
          await fetch(`${base}/api/maestros/cajas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(`${base}/api/maestros/clientes`, {
            headers: { Cookie: reader.cookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(`${base}/api/maestros/cajas`, {
            method: "POST",
            headers: {
              Cookie: reader.cookie,
              "Content-Type": "application/json",
              "X-ERP-Request": "1",
              "X-CSRF-Token": reader.session.csrfToken,
            },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${base}/api/maestros/cajas`, {
            method: "POST",
            headers: {
              Cookie: admin.cookie,
              "Content-Type": "application/json",
              "X-ERP-Request": "1",
            },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal((await request("NOEXISTE")).status, 404);
      assert.equal((await request("clientes?pagina=0")).status, 400);
      assert.equal((await request("clientes?limite=10000")).status, 400);
    },
  );

  await t.test(
    "altas de maestros simples, duplicados, validación y búsqueda literal parametrizada",
    async () => {
      for (const [path, field] of [
        ["tipos-cliente", "Descripcion"],
        ["conceptos", "Descripcion"],
        ["cajas", "Nombre"],
        ["bancos", "Nombre"],
      ] as const) {
        await create(path, {
          Codigo: "M_SIMPLE",
          [field]: "Registro de prueba",
        });
        assert.equal(
          (
            await request(path, "POST", {
              Codigo: "m_simple",
              [field]: "Duplicado",
              Activo: true,
            })
          ).status,
          409,
        );
        const invalid = await request(path, "POST", {
          Codigo: "",
          [field]: "X".repeat(101),
          Activo: true,
          IDTabla: 1,
        });
        assert.equal(invalid.status, 400);
      }
      await create("conceptos", {
        Codigo: "M_%!",
        Descripcion: "Texto '; DROP TABLE ROL;--",
      });
      const literal = (await (
        await request("conceptos?q=" + encodeURIComponent("%!"))
      ).json()) as MasterList;
      assert.equal(literal.total, 1);
      assert.equal(literal.registros[0]?.Codigo, "M_%!");
      const [audit] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM AUDITORIA WHERE Usuario = ? AND Accion = ?",
        [admin.session.usuario.id, "ALTA"],
      );
      assert.equal(Number(audit[0]?.total), 5);
    },
  );

  await t.test(
    "clientes y cuentas guardan referencias y datos opcionales, preservando ceros del CBU",
    async () => {
      await create("clientes", {
        Codigo: "M_CLIENTE",
        ClienteTipo: "M_SIMPLE",
        Nombre: "Cliente de prueba",
        Documento: "00123456",
        Email: "cliente@example.invalid",
      });
      const account = await create("cuentas-bancarias", {
        Codigo: "M_CUENTA",
        Banco: "M_SIMPLE",
        Nombre: "Cuenta propia",
        Titular: "Titular de prueba",
        CBU: "0000000000000000000001",
      });
      assert.equal(account.registro.CBU, "0000000000000000000001");
      assert.equal(account.registro.Alias, null);
      assert.equal(
        (await get("clientes/M_CLIENTE")).registro.Documento,
        "00123456",
      );
      const filtered = (await (
        await request("clientes?referencia=M_SIMPLE")
      ).json()) as MasterList;
      assert.equal(filtered.total, 1);
      const invalid = await request("clientes", "POST", {
        Codigo: "M_INVALIDO",
        ClienteTipo: "NOEXISTE",
        Nombre: "Inválido",
        Activo: true,
      });
      assert.equal(invalid.status, 400);
      assert.ok(((await invalid.json()) as { campos: object }).campos);
      const badEmail = await request("clientes", "POST", {
        Codigo: "M_INVALIDO",
        ClienteTipo: "M_SIMPLE",
        Nombre: "Inválido",
        Email: "no-es-correo",
        Activo: true,
      });
      assert.equal(badEmail.status, 400);
    },
  );

  await t.test(
    "filtros y paginación estable se calculan en la base de datos",
    async () => {
      for (let i = 0; i < 23; i++)
        await create("cajas", {
          Codigo: `PAG_${String(i).padStart(3, "0")}`,
          Nombre: `Caja ${i}`,
          Activo: i !== 0,
        });
      const first = (await (
        await request("cajas?q=PAG_")
      ).json()) as MasterList;
      const second = (await (
        await request("cajas?q=PAG_&pagina=2")
      ).json()) as MasterList;
      assert.equal(first.total, 23);
      assert.equal(first.registros.length, 20);
      assert.equal(second.registros.length, 3);
      assert.equal(first.registros[0]?.Codigo, "PAG_000");
      assert.equal(second.registros[0]?.Codigo, "PAG_020");
      const active = (await (
        await request("cajas?q=PAG_&estado=activo")
      ).json()) as MasterList;
      const inactive = (await (
        await request("cajas?q=PAG_&estado=inactivo")
      ).json()) as MasterList;
      assert.equal(active.total, 22);
      assert.equal(inactive.total, 1);
    },
  );

  await t.test(
    "las FK conservan registros utilizados y las referencias inactivas no se asignan a nuevos clientes",
    async () => {
      const type = await get("tipos-cliente/M_SIMPLE");
      assert.equal(
        (await request("tipos-cliente/M_SIMPLE", "DELETE", {}, type.version))
          .status,
        409,
      );
      const inactive = await update(
        "tipos-cliente/M_SIMPLE",
        { ...type.registro, Activo: false },
        type.version,
      );
      assert.equal(inactive.registro.Activo, false);
      assert.equal(
        (
          await request("clientes", "POST", {
            Codigo: "M_NUEVO",
            Nombre: "Nuevo",
            ClienteTipo: "M_SIMPLE",
            Activo: true,
          })
        ).status,
        400,
      );
      const client = await get("clientes/M_CLIENTE");
      const changed = await update(
        "clientes/M_CLIENTE",
        { ...client.registro, Telefono: "11223344" },
        client.version,
      );
      assert.equal(changed.registro.ClienteTipo, "M_SIMPLE");
      assert.equal(changed.registro.Telefono, "11223344");
      const bank = await get("bancos/M_SIMPLE");
      assert.equal(
        (await request("bancos/M_SIMPLE", "DELETE", {}, bank.version)).status,
        409,
      );
    },
  );

  await t.test(
    "modificaciones y eliminaciones obsoletas se rechazan; el código es inmutable",
    async () => {
      const original = await get("conceptos/M_SIMPLE");
      const changed = await update(
        "conceptos/M_SIMPLE",
        { ...original.registro, Descripcion: "Descripción actualizada" },
        original.version,
      );
      assert.notEqual(changed.version, original.version);
      assert.equal(
        (
          await request(
            "conceptos/M_SIMPLE",
            "PUT",
            { ...original.registro, Descripcion: "No sobrescribir" },
            original.version,
          )
        ).status,
        409,
      );
      assert.equal(
        (await request("conceptos/M_SIMPLE", "DELETE", {}, original.version))
          .status,
        409,
      );
      assert.equal(
        (
          await request(
            "conceptos/M_SIMPLE",
            "PUT",
            { ...changed.registro, Codigo: "OTRO" },
            changed.version,
          )
        ).status,
        400,
      );
      assert.equal(
        (await get("conceptos/M_SIMPLE")).registro.Descripcion,
        "Descripción actualizada",
      );
      assert.equal(
        (await request("conceptos/M_SIMPLE", "DELETE", {}, changed.version))
          .status,
        204,
      );
      assert.equal((await request("conceptos/M_SIMPLE")).status, 404);
      const [audit] = await pool.execute<RowDataPacket[]>(
        "SELECT Accion, Detalle FROM AUDITORIA WHERE Usuario = ? AND Tabla = ? AND Registro = ? ORDER BY IDTabla",
        [admin.session.usuario.id, "CONCEPTO", "M_SIMPLE"],
      );
      assert.deepEqual(
        audit.map((row) => row.Accion),
        ["ALTA", "MODIFICACION", "BAJA"],
      );
      const snapshot =
        typeof audit[1]?.Detalle === "string"
          ? JSON.parse(audit[1].Detalle)
          : audit[1]?.Detalle;
      assert.equal(snapshot.Antes.Descripcion, "Registro de prueba");
      assert.equal(snapshot.Despues.Descripcion, "Descripción actualizada");
    },
  );

  await t.test(
    "si falla la auditoría, la modificación de negocio se revierte",
    async () => {
      const master = await get("cajas/M_SIMPLE");
      const store = createMasterStore(pool);
      await assert.rejects(
        store.write(
          {
            key: "cajas",
            title: "",
            singular: "",
            description: "",
            fields: [
              { name: "Codigo", label: "", maxLength: 20 },
              { name: "Nombre", label: "", maxLength: 100 },
            ],
            columns: [],
          },
          "MODIFICACION",
          { ...master.registro, Nombre: "Debe revertirse" },
          master.registro.Codigo,
          "999999999999",
          master.version,
        ),
      );
      assert.equal(
        (await get("cajas/M_SIMPLE")).registro.Nombre,
        "Registro de prueba",
      );
    },
  );
});
