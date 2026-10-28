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
import { masterDefinitions } from "@erp/shared";

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
    "el código sugerido requiere sesión, es de lectura y no reserva números",
    async () => {
      assert.equal(
        (await fetch(`${base}/api/maestros/clientes/meta/siguiente-codigo`))
          .status,
        401,
      );
      for (let i = 0; i < 2; i++) {
        const response = await request("clientes/meta/siguiente-codigo");
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.deepEqual(await response.json(), { codigo: "00001" });
      }
      const [clients] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CLIENTE",
      );
      assert.equal(Number(clients[0]?.total), 0);
      const [audit] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM AUDITORIA WHERE Usuario = ?",
        [admin.session.usuario.id],
      );
      assert.equal(Number(audit[0]?.total), 5);
    },
  );

  await t.test(
    "clientes y cuentas guardan referencias y datos opcionales, preservando ceros del CBU",
    async () => {
      const firstClient = await create("clientes", {
        ClienteTipo: "M_SIMPLE",
        Nombre: "Cliente de prueba",
        Documento: "00123456",
        Email: "cliente@example.invalid",
      });
      assert.equal(firstClient.registro.Codigo, "00001");
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
        (await get("clientes/00001")).registro.Documento,
        "00123456",
      );
      const filtered = (await (
        await request("clientes?referencia=M_SIMPLE")
      ).json()) as MasterList;
      assert.equal(filtered.total, 1);
      const invalid = await request("clientes", "POST", {
        ClienteTipo: "NOEXISTE",
        Nombre: "Inválido",
        Activo: true,
      });
      assert.equal(invalid.status, 400);
      assert.ok(((await invalid.json()) as { campos: object }).campos);
      const badEmail = await request("clientes", "POST", {
        ClienteTipo: "M_SIMPLE",
        Nombre: "Inválido",
        Email: "no-es-correo",
        Activo: true,
      });
      assert.equal(badEmail.status, 400);
    },
  );

  await t.test(
    "el listado describe el tipo sin cambiar la FK, la versión ni las referencias inactivas",
    async () => {
      const client = await get("clientes/00001");
      const type = await get("tipos-cliente/M_SIMPLE");
      const list = async () => {
        const response = await request(
          "clientes?referencia=M_SIMPLE&estado=activo&pagina=1&limite=1&q=Cliente",
        );
        assert.equal(response.status, 200);
        return (await response.json()) as MasterList;
      };
      const original = await list();
      assert.equal(original.total, 1);
      assert.equal(original.registros.length, 1);
      assert.equal(original.registros[0]?.ClienteTipo, "M_SIMPLE");
      assert.deepEqual(original.registros[0], client.registro);
      assert.deepEqual(original.descripciones, {
        ClienteTipo: { M_SIMPLE: type.registro.Descripcion },
      });

      const renamed = await update(
        "tipos-cliente/M_SIMPLE",
        {
          ...type.registro,
          Descripcion: "Tipo actualizado desde su maestro",
          Activo: false,
        },
        type.version,
      );
      try {
        const refreshed = await list();
        assert.deepEqual(refreshed.descripciones, {
          ClienteTipo: { M_SIMPLE: "Tipo actualizado desde su maestro" },
        });
        assert.deepEqual(refreshed.registros, original.registros);
        assert.equal((await get("clientes/00001")).version, client.version);
        // El detalle y la escritura siguen utilizando el código, no las etiquetas.
        const saved = await update(
          "clientes/00001",
          client.registro,
          client.version,
        );
        assert.equal(saved.registro.ClienteTipo, "M_SIMPLE");
        const empty = await request("clientes?referencia=NO_EXISTE");
        assert.equal(empty.status, 200);
        const result = (await empty.json()) as MasterList;
        assert.equal(result.total, 0);
        assert.deepEqual(result.registros, []);
        assert.deepEqual(result.descripciones, { ClienteTipo: {} });
      } finally {
        await update("tipos-cliente/M_SIMPLE", type.registro, renamed.version);
      }
    },
  );

  await t.test(
    "las cuentas muestran el nombre actual del banco sin cambiar códigos ni versiones",
    async () => {
      const account = await get("cuentas-bancarias/M_CUENTA");
      const bank = await get("bancos/M_SIMPLE");
      const list = async () => {
        const response = await request(
          "cuentas-bancarias?referencia=M_SIMPLE&estado=activo&q=M_CUENTA&limite=1",
        );
        assert.equal(response.status, 200);
        return (await response.json()) as MasterList;
      };
      const current = await list();
      assert.equal(current.total, 1);
      assert.equal(current.registros[0]?.Banco, "M_SIMPLE");
      assert.deepEqual(current.registros, [account.registro]);
      assert.deepEqual(current.descripciones, {
        Banco: { M_SIMPLE: "Registro de prueba" },
      });
      const renamed = await update(
        "bancos/M_SIMPLE",
        {
          ...bank.registro,
          Nombre: "Banco actualizado desde su maestro",
          Activo: false,
        },
        bank.version,
      );
      try {
        const refreshed = await list();
        assert.deepEqual(refreshed.descripciones, {
          Banco: { M_SIMPLE: "Banco actualizado desde su maestro" },
        });
        assert.deepEqual(refreshed.registros, current.registros);
        assert.equal(
          (await get("cuentas-bancarias/M_CUENTA")).version,
          account.version,
        );
        const saved = await update(
          "cuentas-bancarias/M_CUENTA",
          account.registro,
          account.version,
        );
        assert.equal(saved.registro.Banco, "M_SIMPLE");
        const empty = await request("cuentas-bancarias?referencia=NO_EXISTE");
        assert.equal(empty.status, 200);
        assert.deepEqual(((await empty.json()) as MasterList).descripciones, {
          Banco: {},
        });
        const simple = await request("cajas");
        assert.equal(simple.status, 200);
        assert.equal(
          ((await simple.json()) as MasterList).descripciones,
          undefined,
        );
      } finally {
        await update("bancos/M_SIMPLE", bank.registro, renamed.version);
      }
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
            Nombre: "Nuevo",
            ClienteTipo: "M_SIMPLE",
            Activo: true,
          })
        ).status,
        400,
      );
      const client = await get("clientes/00001");
      const changed = await update(
        "clientes/00001",
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

  await t.test(
    "CLIENTE asigna códigos consecutivos en altas simultáneas desde dos pools independientes",
    async () => {
      await create("tipos-cliente", {
        Codigo: "CORR",
        Descripcion: "Prueba de correlativo",
      });
      const other = createDatabase(config);
      const second = createApp({
        checkDatabase: async () => {},
        auth: createAuthService(createAuthStore(other.pool)),
        masters: createMasterStore(other.pool),
      }).listen(0, "127.0.0.1");
      await once(second, "listening");
      try {
        const address = second.address();
        assert.ok(address && typeof address !== "string");
        const bases = [base, `http://127.0.0.1:${address.port}`];
        for (const url of bases) {
          const suggestion = await fetch(
            `${url}/api/maestros/clientes/meta/siguiente-codigo`,
            { headers: { Cookie: admin.cookie } },
          );
          assert.deepEqual(await suggestion.json(), { codigo: "00002" });
        }
        const results = await Promise.all(
          Array.from({ length: 16 }, async (_, i) => {
            const response = await fetch(
              `${bases[i % 2]}/api/maestros/clientes`,
              {
                method: "POST",
                headers: {
                  Cookie: admin.cookie,
                  "Content-Type": "application/json",
                  "X-ERP-Request": "1",
                  "X-CSRF-Token": admin.session.csrfToken,
                },
                body: JSON.stringify({
                  Nombre: `Cliente simultáneo ${i}`,
                  ClienteTipo: "CORR",
                  Activo: true,
                }),
              },
            );
            assert.equal(response.status, 201, await response.clone().text());
            return ((await response.json()) as MasterDetail).registro.Codigo;
          }),
        );
        assert.equal(new Set(results).size, 16);
        assert.deepEqual(
          results.sort(),
          Array.from({ length: 16 }, (_, i) => String(i + 2).padStart(5, "0")),
        );
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM AUDITORIA WHERE Tabla = 'CLIENTE' AND Accion = 'ALTA'",
        );
        assert.equal(Number(rows[0]?.total), 17);
      } finally {
        await new Promise<void>((resolve, reject) =>
          second.close((error) => (error ? reject(error) : resolve())),
        );
        await other.pool.end();
      }
    },
  );

  await t.test(
    "el código no se admite manualmente y un alta revertida libera el bloqueo sin consumir número",
    async () => {
      const manual = await request("clientes", "POST", {
        Codigo: "00999",
        Nombre: "No insertar",
        ClienteTipo: "CORR",
        Activo: true,
      });
      assert.equal(manual.status, 400);
      assert.ok(
        ((await manual.json()) as { campos: Record<string, string> }).campos
          .Codigo,
      );
      await assert.rejects(
        createMasterStore(pool).write(
          masterDefinitions.clientes,
          "ALTA",
          { Codigo: "", Nombre: "Revertir", ClienteTipo: "CORR", Activo: true },
          "",
          "999999999999",
        ),
      );
      const other = createDatabase(config);
      try {
        const saved = await createMasterStore(other.pool).write(
          masterDefinitions.clientes,
          "ALTA",
          {
            Codigo: "",
            Nombre: "Luego de rollback",
            ClienteTipo: "CORR",
            Activo: true,
          },
          "",
          admin.session.usuario.id,
        );
        assert.equal(saved?.registro.Codigo, "00018");
      } finally {
        await other.pool.end();
      }
    },
  );

  await t.test(
    "se conservan códigos anteriores, se toma el máximo numérico y las bajas permiten reutilizar el último",
    async () => {
      const legacy = ["9", "900", "1000", "CLI_ANTIGUO", "123456"];
      for (const code of legacy)
        await pool.execute(
          "INSERT INTO CLIENTE (Codigo, Nombre, ClienteTipo) VALUES (?, ?, ?)",
          [code, "Cliente anterior " + code, "CORR"],
        );
      const generated = await create("clientes", {
        Nombre: "Nuevo cliente",
        ClienteTipo: "CORR",
      });
      assert.equal(generated.registro.Codigo, "01001");
      for (const code of legacy)
        assert.equal(
          (await get("clientes/" + code)).registro.Nombre,
          "Cliente anterior " + code,
        );
      assert.equal(
        (await request("clientes/01001", "DELETE", {}, generated.version))
          .status,
        204,
      );
      const reused = await create("clientes", {
        Nombre: "Luego de la baja",
        ClienteTipo: "CORR",
      });
      assert.equal(reused.registro.Codigo, "01001");
      await update(
        "clientes/01001",
        { ...reused.registro, Activo: false },
        reused.version,
      );
      const next = await create("clientes", {
        Nombre: "Luego de desactivar",
        ClienteTipo: "CORR",
      });
      assert.equal(next.registro.Codigo, "01002");
    },
  );

  await t.test(
    "99999 detiene la numeración sin escribir ni agregar tablas",
    async () => {
      await pool.execute(
        "INSERT INTO CLIENTE (Codigo, Nombre, ClienteTipo) VALUES (?, ?, ?)",
        ["99999", "Límite de prueba", "CORR"],
      );
      const [before] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CLIENTE",
      );
      assert.equal(
        (await request("clientes/meta/siguiente-codigo")).status,
        409,
      );
      const response = await request("clientes", "POST", {
        Nombre: "No crear",
        ClienteTipo: "CORR",
        Activo: true,
      });
      assert.equal(response.status, 409);
      assert.match(
        ((await response.json()) as { error: string }).error,
        /agotó/,
      );
      const [after] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CLIENTE",
      );
      assert.equal(Number(after[0]?.total), Number(before[0]?.total));
      const [tables] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations'",
      );
      assert.equal(Number(tables[0]?.total), 21);
      await pool.execute("DELETE FROM CLIENTE WHERE Codigo = ?", ["99999"]);
    },
  );

  const voucherInput = {
    Codigo: "PR_ET4",
    EsReversion: false,
    ComprobanteReversion: null,
    Descripcion: "Premio",
    ModuloOrigen: "CUENTACORRIENTE",
    Cuenta: "PAGAR",
    Naturaleza: "DEUDA",
    SentidoFondos: "NOAPLICA",
    Orden: "0",
    Activo: true,
  };
  await t.test(
    "Comprobantes: catálogo compartido, persistencia, edición, filtros, estados y baja",
    async () => {
      const saved = await create("comprobantes", voucherInput);
      assert.deepEqual(saved.registro, voucherInput);
      for (const [field, values] of Object.entries({
        ModuloOrigen: [
          "CUENTACORRIENTE",
          "COBROSPAGOS",
          "TESORERIA",
          "VALORES",
        ],
        Cuenta: ["COBRAR", "PAGAR", "NOAPLICA"],
        Naturaleza: ["DEUDA", "CREDITO", "NOAPLICA"],
        SentidoFondos: ["INGRESO", "EGRESO", "NOAPLICA"],
      })) {
        for (const value of values) {
          const before = await get("comprobantes/PR_ET4");
          const changed = await update(
            "comprobantes/PR_ET4",
            { ...before.registro, [field]: value },
            before.version,
          );
          assert.equal(changed.registro[field], value);
        }
        const bad = await request("comprobantes", "POST", {
          ...voucherInput,
          Codigo: "INVALIDO",
          [field]: "NO_DEFINIDO",
        });
        assert.equal(bad.status, 400);
        assert.ok(
          ((await bad.json()) as { campos: Record<string, string> }).campos[
            field
          ],
        );
      }
      const current = await get("comprobantes/PR_ET4");
      const restored = await update(
        "comprobantes/PR_ET4",
        voucherInput,
        current.version,
      );
      assert.equal(
        (await request("comprobantes", "POST", voucherInput)).status,
        409,
      );
      assert.equal(
        (
          await request(
            "comprobantes/PR_ET4",
            "PUT",
            { ...voucherInput, Descripcion: "Vieja" },
            current.version,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "comprobantes/PR_ET4",
            "PUT",
            { ...voucherInput, Codigo: "OTRO" },
            restored.version,
          )
        ).status,
        400,
      );
      const filtered = (await (
        await request("comprobantes?q=Premio&estado=activo")
      ).json()) as MasterList;
      assert.equal(filtered.total, 1);
      assert.equal(filtered.registros[0]?.Codigo, "PR_ET4");
      await create("comprobantes", {
        ...voucherInput,
        Codigo: "ET4_BAJA",
        Orden: "",
      });
      const disposable = await get("comprobantes/ET4_BAJA");
      assert.equal(disposable.registro.Orden, null);
      assert.equal(
        (
          await request(
            "comprobantes/ET4_BAJA",
            "DELETE",
            {},
            disposable.version,
          )
        ).status,
        204,
      );
      assert.equal((await request("comprobantes/ET4_BAJA")).status, 404);
      const inactive = await update(
        "comprobantes/PR_ET4",
        { ...restored.registro, Activo: false },
        restored.version,
      );
      const inactiveList = (await (
        await request("comprobantes?estado=inactivo")
      ).json()) as MasterList;
      assert.ok(inactiveList.registros.some((row) => row.Codigo === "PR_ET4"));
      await update(
        "comprobantes/PR_ET4",
        { ...inactive.registro, Activo: true },
        inactive.version,
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT Cuenta, Naturaleza, SentidoFondos FROM COMPROBANTE WHERE Codigo = 'PR_ET4'",
      );
      assert.equal(rows[0]?.Cuenta, "PAGAR");
      const [movements] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM CUENTACORRIENTE",
      );
      assert.equal(
        Number(movements[0]!.total),
        0,
        "Configurar comprobantes no genera movimientos",
      );
      const [audit] = await pool.query<RowDataPacket[]>(
        "SELECT Accion FROM AUDITORIA WHERE Tabla = 'COMPROBANTE' AND Registro = 'ET4_BAJA' ORDER BY IDTabla",
      );
      assert.deepEqual(
        audit.map((row) => row.Accion),
        ["ALTA", "BAJA"],
      );
    },
  );
  await t.test(
    "Comprobantes de reversión: asociación compatible, sin cadenas ni pérdida de relaciones",
    async () => {
      const reverse = await create("comprobantes", {
        ...voucherInput,
        Codigo: "M_REV",
        Descripcion: "Reversión pago",
        ModuloOrigen: "COBROSPAGOS",
        EsReversion: true,
        Cuenta: "PAGAR",
        Naturaleza: "DEUDA",
        SentidoFondos: "INGRESO",
      });
      const normal = {
        ...voucherInput,
        Codigo: "M_PAGO",
        ModuloOrigen: "COBROSPAGOS",
        Naturaleza: "CREDITO",
        SentidoFondos: "EGRESO",
        ComprobanteReversion: "M_REV",
      };
      const linked = await create("comprobantes", normal);
      assert.equal(linked.registro.ComprobanteReversion, "M_REV");
      assert.equal(linked.registro.EsReversion, false);
      assert.equal(reverse.registro.EsReversion, true);
      // Es válido compartir un comprobante de reversión compatible.
      await create("comprobantes", { ...normal, Codigo: "M_PAGO2" });
      for (const changes of [
        { Codigo: "M_BAD1", EsReversion: true },
        { Codigo: "M_BAD2", Cuenta: "COBRAR" },
        { Codigo: "M_BAD3", SentidoFondos: "INGRESO" },
        { Codigo: "M_BAD4", ComprobanteReversion: "M_PAGO" },
        { Codigo: "M_BAD5", ComprobanteReversion: "M_BAD5" },
      ])
        assert.equal(
          (await request("comprobantes", "POST", { ...normal, ...changes }))
            .status,
          400,
        );
      for (const changes of [
        { EsReversion: false },
        { Cuenta: "COBRAR", SentidoFondos: "EGRESO" },
        { ComprobanteReversion: "M_PAGO" },
      ])
        assert.equal(
          (
            await request(
              "comprobantes/M_REV",
              "PUT",
              { ...reverse.registro, ...changes },
              reverse.version,
            )
          ).status,
          400,
        );
      assert.equal(
        (await request("comprobantes/M_REV", "DELETE", {}, reverse.version))
          .status,
        409,
      );
      const inactive = await update(
        "comprobantes/M_REV",
        { ...reverse.registro, Activo: false },
        reverse.version,
      );
      assert.equal(
        (await get("comprobantes/M_PAGO")).registro.ComprobanteReversion,
        "M_REV",
      );
      await update(
        "comprobantes/M_REV",
        { ...inactive.registro, Activo: true },
        inactive.version,
      );
    },
  );
  await t.test(
    "Numerador único por comprobante: BIGINT completo, conflictos y auditoría",
    async () => {
      const saved = await create("numeraciones", {
        Comprobante: "PR_ET4",
        ProximoNumero: "100000025",
      });
      const id = String(saved.registro.IDTabla);
      assert.equal(saved.registro.ProximoNumero, "100000025");
      assert.equal(Object.hasOwn(saved.registro, "Serie"), false);
      assert.equal(Object.hasOwn(saved.registro, "Codigo"), false);
      const duplicates = await Promise.all([
        request("numeraciones", "POST", {
          Comprobante: "PR_ET4",
          ProximoNumero: "200000001",
          Activo: true,
        }),
        request("numeraciones", "POST", {
          Comprobante: "PR_ET4",
          ProximoNumero: "300000001",
          Activo: true,
        }),
      ]);
      assert.ok(duplicates.every((r) => r.status === 409));
      for (const ProximoNumero of [
        "0",
        "100000000",
        "1000000000000",
        "-1",
        "0001-00000001",
        "1.1",
      ])
        assert.equal(
          (
            await request("numeraciones", "POST", {
              Comprobante: "PR_ET4",
              ProximoNumero,
              Activo: true,
            })
          ).status,
          400,
          ProximoNumero,
        );
      const invalid = await request("numeraciones", "POST", {
        Comprobante: "PR_ET4",
        ProximoNumero: "100000001",
        Serie: "1",
        Activo: true,
      });
      assert.equal(invalid.status, 400);
      const before = await get("numeraciones/" + id);
      const changed = await update(
        "numeraciones/" + id,
        { ...before.registro, ProximoNumero: "100000026" },
        before.version,
      );
      assert.equal(
        (
          await request(
            "numeraciones/" + id,
            "PUT",
            before.registro,
            before.version,
          )
        ).status,
        409,
      );
      const filtered = (await (
        await request("numeraciones?referencia=PR_ET4")
      ).json()) as MasterList;
      assert.equal(filtered.total, 1);
      assert.equal(filtered.descripciones?.Comprobante?.PR_ET4, "Premio");
      assert.equal(
        (
          await request(
            "comprobantes/PR_ET4",
            "DELETE",
            {},
            (await get("comprobantes/PR_ET4")).version,
          )
        ).status,
        409,
      );
      assert.equal(changed.registro.ProximoNumero, "100000026");
    },
  );
  await t.test(
    "Cambiar o borrar el Numerador no altera el número histórico; no se retrocede dentro del punto de venta",
    async () => {
      const number = (await (
        await request("numeraciones?referencia=PR_ET4")
      ).json()) as MasterList;
      const id = String(number.registros[0]!.IDTabla);
      await pool.execute(
        "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,NumeroComprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          "00001",
          "PR_ET4",
          "100000050",
          "2026-10-25",
          "PAGAR",
          "DEUDA",
          "10.00",
          "ANULADO",
          admin.session.usuario.id,
          new Date(),
        ],
      );
      const before = await get("numeraciones/" + id);
      assert.equal(before.camposSoloLectura, undefined);
      assert.equal(
        (
          await request(
            "numeraciones/" + id,
            "PUT",
            { ...before.registro, ProximoNumero: "100000050" },
            before.version,
          )
        ).status,
        409,
      );
      const other = await update(
        "numeraciones/" + id,
        { ...before.registro, ProximoNumero: "200000001" },
        before.version,
      );
      assert.equal(
        (await request("numeraciones/" + id, "DELETE", {}, other.version))
          .status,
        204,
      );
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT NumeroComprobante FROM CUENTACORRIENTE WHERE Comprobante=?",
        ["PR_ET4"],
      );
      assert.equal(String(rows[0]!.NumeroComprobante), "100000050");
    },
  );
  await t.test(
    "Comprobantes y Numeración mantienen permisos, CSRF y auditoría",
    async () => {
      for (const key of ["comprobantes", "numeraciones"]) {
        assert.equal((await fetch(`${base}/api/maestros/${key}`)).status, 401);
        assert.equal(
          (
            await fetch(`${base}/api/maestros/${key}`, {
              headers: { Cookie: reader.cookie },
            })
          ).status,
          200,
        );
        const readerWrite = await fetch(`${base}/api/maestros/${key}`, {
          method: "POST",
          headers: {
            Cookie: reader.cookie,
            "Content-Type": "application/json",
            "X-ERP-Request": "1",
            "X-CSRF-Token": reader.session.csrfToken,
          },
          body: "{}",
        });
        assert.equal(readerWrite.status, 403);
        const noCsrf = await fetch(`${base}/api/maestros/${key}`, {
          method: "POST",
          headers: {
            Cookie: admin.cookie,
            "Content-Type": "application/json",
            "X-ERP-Request": "1",
          },
          body: "{}",
        });
        assert.equal(noCsrf.status, 403);
      }
    },
  );
});
