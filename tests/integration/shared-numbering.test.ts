import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashDetail,
  CurrentAccountDetail,
  MasterDetail,
  CashOptions,
  SessionResponse,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";

test("Numeradores compartidos: secuencia global, cajas, consumo histórico e idempotencia", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  assert.equal(config.DB_HOST, "127.0.0.1");
  await applyMigrations(config);
  const { pool } = createDatabase(config),
    other = createDatabase(config);
  const password = randomBytes(24).toString("hex"),
    hash = await hashPassword(password);
  await pool.execute(
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Numeradores','shared-numbering@example.invalid',?,'ADMIN',?)",
    [hash, new Date()],
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('NS_T','Numeración compartida')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('NS_C','Cliente numeradores','NS_T')",
  );
  await pool.query(
    "INSERT INTO CONCEPTO (Codigo,Descripcion) VALUES ('NS_F','Fondos de numeración')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('NS_A','Caja A'),('NS_B','Caja B')",
  );
  const app = (p: typeof pool) =>
    createApp({
      checkDatabase: async () => {},
      auth: createAuthService(createAuthStore(p)),
      masters: createMasterStore(p),
      currentAccount: createCurrentAccountStore(p),
      cashMovement: createCashMovementStore(p),
      treasury: createCashMovementStore(p, "TESORERIA"),
    });
  const servers = [
    app(pool).listen(0, "127.0.0.1"),
    app(other.pool).listen(0, "127.0.0.1"),
  ];
  await Promise.all(servers.map((s) => once(s, "listening")));
  t.after(async () => {
    await Promise.all(
      servers.map(
        (s) => new Promise<void>((resolve) => s.close(() => resolve())),
      ),
    );
    await pool.end();
    await other.pool.end();
  });
  const bases = servers.map((s) => {
    const a = s.address();
    assert.ok(a && typeof a !== "string");
    return `http://127.0.0.1:${a.port}/api/`;
  });
  const login = await fetch(bases[0] + "auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
    body: JSON.stringify({
      email: "shared-numbering@example.invalid",
      password,
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!,
    session = (await login.json()) as SessionResponse;
  const req = (
    path: string,
    method = "GET",
    body?: unknown,
    version?: string,
    key = randomUUID(),
    instance = 0,
  ) =>
    fetch(bases[instance] + path, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": session.csrfToken,
        "Idempotency-Key": key,
        ...(version ? { "If-Match": '"' + version + '"' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const good = async <T>(r: Response, status = 200): Promise<T> => {
    assert.equal(r.status, status, await r.clone().text());
    return r.json() as Promise<T>;
  };
  const rows = async (sql: string, params: (string | number)[] = []) =>
    (await pool.execute<RowDataPacket[]>(sql, params))[0];
  const master = (key: string, body: unknown) =>
    req("maestros/" + key, "POST", body);
  const readN = async (code = "NS_GENERAL") =>
    good<MasterDetail>(await req("maestros/numeraciones/" + code));
  const updateN = async (code: string, fields: Record<string, unknown>) => {
    const n = await readN(code);
    return good<MasterDetail>(
      await req(
        "maestros/numeraciones/" + code,
        "PUT",
        { ...n.registro, ...fields },
        n.version,
      ),
    );
  };
  await good(
    await master("numeraciones", {
      Codigo: "NS_GENERAL",
      ProximoNumero: "100000001",
      Activo: true,
    }),
    201,
  );
  await good(
    await master("numeraciones", {
      Codigo: "NS_BOX",
      ProximoNumero: "200000001",
      Caja: "NS_A",
      Activo: true,
    }),
    201,
  );
  for (const [
    Codigo,
    ModuloOrigen,
    Cuenta,
    Naturaleza,
    SentidoFondos,
    Numerador,
  ] of [
    ["NS_CC1", "CUENTACORRIENTE", "COBRAR", "DEUDA", "NOAPLICA", "NS_GENERAL"],
    ["NS_CC2", "CUENTACORRIENTE", "PAGAR", "DEUDA", "NOAPLICA", "NS_GENERAL"],
    ["NS_CB", "CUENTACORRIENTE", "COBRAR", "DEUDA", "NOAPLICA", "NS_BOX"],
    ["NS_CASH", "COBROSPAGOS", "COBRAR", "CREDITO", "INGRESO", "NS_GENERAL"],
    ["NS_CASHBOX", "COBROSPAGOS", "COBRAR", "CREDITO", "INGRESO", "NS_BOX"],
    ["NS_TI", "TESORERIA", "NOAPLICA", "NOAPLICA", "INGRESO", "NS_GENERAL"],
    ["NS_TE", "TESORERIA", "NOAPLICA", "NOAPLICA", "EGRESO", "NS_GENERAL"],
    ["NS_TB", "TESORERIA", "NOAPLICA", "NOAPLICA", "INGRESO", "NS_BOX"],
    ["NS_MAN", "TESORERIA", "NOAPLICA", "NOAPLICA", "INGRESO", null],
  ])
    await good(
      await master("comprobantes", {
        Codigo,
        Descripcion: Codigo,
        ModuloOrigen,
        Cuenta,
        Naturaleza,
        SentidoFondos,
        Numerador,
        Activo: true,
      }),
      201,
    );
  const open = async (Caja: string) =>
    good<{ IDTabla: string }>(
      await req("caja-movimiento/cajas", "POST", {
        Caja,
        SaldoInicial: "1000",
      }),
      201,
    );
  const boxes = [await open("NS_A"), await open("NS_B")],
    date = "2026-10-28";
  const cc = (Comprobante = "NS_CC1", extra: Record<string, unknown> = {}) => ({
    Cliente: "NS_C",
    Comprobante,
    NumeroComprobante: "0",
    NumeroAutomatico: true,
    FechaOrigen: date,
    Vencimiento: null,
    Importe: "1",
    Observacion: null,
    ...extra,
  });
  const cash = (
    Comprobante = "NS_CASH",
    box = boxes[0]!.IDTabla,
    extra: Record<string, unknown> = {},
  ) => ({
    Cliente: "NS_C",
    Comprobante,
    NumeroComprobante: "0",
    NumeroAutomatico: true,
    FechaOrigen: date,
    CajaSaldo: box,
    Concepto: null,
    ImporteEfectivo: "1",
    ImporteACuenta: "1",
    Observacion: null,
    Afectaciones: [],
    Valores: [],
    ...extra,
  });
  const treasury = (
    Comprobante = "NS_TI",
    box = boxes[0]!.IDTabla,
    extra: Record<string, unknown> = {},
  ) => ({
    Comprobante,
    NumeroComprobante: "0",
    NumeroAutomatico: true,
    FechaOrigen: date,
    CajaSaldo: box,
    Concepto: "NS_F",
    Importe: "1",
    Observacion: null,
    ...extra,
  });
  let treasuryRecord: CashDetail;
  await t.test(
    "Cuenta corriente, Cobro, Tesorería y Pago comparten un solo correlativo",
    async () => {
      const a = await good<CurrentAccountDetail>(
        await req("cuenta-corriente", "POST", cc()),
        201,
      );
      const b = await good<CashDetail>(
        await req("caja-movimiento", "POST", cash()),
        201,
      );
      treasuryRecord = await good<CashDetail>(
        await req("tesoreria", "POST", treasury()),
        201,
      );
      const d = await good<CurrentAccountDetail>(
        await req("cuenta-corriente", "POST", cc("NS_CC2")),
        201,
      );
      assert.deepEqual(
        [
          a.registro.NumeroComprobante,
          b.registro.NumeroComprobante,
          treasuryRecord.registro.NumeroComprobante,
          d.registro.NumeroComprobante,
        ],
        ["100000001", "100000002", "100000003", "100000004"],
      );
      assert.equal((await readN()).registro.ProximoNumero, "100000005");
      assert.equal(
        (
          await rows(
            "SELECT * FROM NUMERACIONUSO u JOIN NUMERACION n ON n.IDTabla=u.Numerador WHERE n.Codigo='NS_GENERAL'",
          )
        ).length,
        4,
        "El asiento interno de un cobro no consume otro número",
      );
    },
  );
  await t.test(
    "Caja fija se respeta en fondos, Cuenta corriente la ignora y caja incompatible permite manual",
    async () => {
      const a = await good<CurrentAccountDetail>(
        await req("cuenta-corriente", "POST", cc("NS_CB")),
        201,
      );
      assert.equal(a.registro.NumeroComprobante, "200000001");
      const b = await good<CashDetail>(
        await req("caja-movimiento", "POST", cash("NS_CASHBOX")),
        201,
      );
      assert.equal(b.registro.NumeroComprobante, "200000002");
      const before = (await readN("NS_BOX")).registro.ProximoNumero;
      const manual = treasury("NS_TB", boxes[1]!.IDTabla, {
        NumeroAutomatico: false,
        NumeroComprobante: "123",
      });
      assert.equal(
        (await req("tesoreria", "POST", { ...manual, NumeroAutomatico: true }))
          .status,
        409,
      );
      const saved = await good<CashDetail>(
        await req("tesoreria", "POST", manual),
        201,
      );
      assert.equal(saved.registro.NumeroComprobante, "123");
      assert.equal((await readN("NS_BOX")).registro.ProximoNumero, before);
      assert.equal(
        (await req("tesoreria", "POST", manual)).status,
        409,
        "Tampoco se repite un número manual del comprobante",
      );
      assert.equal(
        (await rows("SELECT * FROM NUMERACIONUSO WHERE Comprobante='NS_TB'"))
          .length,
        0,
      );
      const options = await good<CashOptions>(await req("tesoreria/opciones"));
      assert.equal(
        options.numeradores.find((n) => n.Comprobante === "NS_TB")!.Caja,
        "NS_A",
      );
    },
  );
  await t.test(
    "Numerador ausente o inactivo permite manual y nunca cambia otra secuencia",
    async () => {
      await good(
        await req(
          "tesoreria",
          "POST",
          treasury("NS_MAN", boxes[0]!.IDTabla, {
            NumeroAutomatico: false,
            NumeroComprobante: "700",
          }),
        ),
        201,
      );
      const n = await updateN("NS_BOX", { Activo: false });
      await good(
        await req(
          "caja-movimiento",
          "POST",
          cash("NS_CASHBOX", boxes[0]!.IDTabla, {
            NumeroAutomatico: false,
            NumeroComprobante: "800",
          }),
        ),
        201,
      );
      assert.equal(
        (await readN("NS_BOX")).registro.ProximoNumero,
        n.registro.ProximoNumero,
      );
      await updateN("NS_BOX", { Activo: true });
      assert.equal(
        (
          await req(
            "tesoreria",
            "POST",
            treasury("NS_TB", boxes[0]!.IDTabla, {
              NumeroAutomatico: false,
              NumeroComprobante: "999",
            }),
          )
        ).status,
        409,
        "Un número automático no admite forzar entrada manual",
      );
    },
  );
  await t.test(
    "dos instancias y distintos módulos asignan números únicos bajo solicitudes simultáneas",
    async () => {
      const first = BigInt(String((await readN()).registro.ProximoNumero));
      const jobs = Array.from({ length: 12 }, (_, i) =>
        i % 3 === 0
          ? ["cuenta-corriente", cc(i % 2 ? "NS_CC1" : "NS_CC2")]
          : i % 3 === 1
            ? ["caja-movimiento", cash()]
            : ["tesoreria", treasury()],
      );
      const responses = await Promise.all(
        jobs.map(([path, body], i) =>
          req(String(path), "POST", body, undefined, randomUUID(), i % 2),
        ),
      );
      const numbers = await Promise.all(
        responses.map(
          async (r) =>
            (await good<{ registro: { NumeroComprobante: string } }>(r, 201))
              .registro.NumeroComprobante,
        ),
      );
      assert.deepEqual(
        numbers.map(BigInt).sort((a, b) => (a < b ? -1 : 1)),
        Array.from({ length: 12 }, (_, i) => first + BigInt(i)),
      );
      assert.equal(
        (await readN()).registro.ProximoNumero,
        (first + 12n).toString(),
      );
    },
  );
  await t.test(
    "un reintento no consume otro número aunque cambie la sugerencia visual",
    async () => {
      const key = randomUUID(),
        body = cc();
      const a = await good<CurrentAccountDetail>(
        await req(
          "cuenta-corriente",
          "POST",
          { ...body, NumeroComprobante: "100000099" },
          undefined,
          key,
        ),
        201,
      );
      const n = (await readN()).registro.ProximoNumero;
      const b = await good<CurrentAccountDetail>(
        await req(
          "cuenta-corriente",
          "POST",
          { ...body, NumeroComprobante: "100000199" },
          undefined,
          key,
        ),
        201,
      );
      assert.equal(a.registro.IDTabla, b.registro.IDTabla);
      assert.equal((await readN()).registro.ProximoNumero, n);
    },
  );
  await t.test(
    "anular y reasociar no liberan consumos anteriores; no se puede borrar un numerador usado",
    async () => {
      const initial = (await readN()).registro.ProximoNumero;
      await good(
        await req(
          "tesoreria/" + treasuryRecord.registro.IDTabla + "/anular",
          "POST",
          { CajaSaldo: boxes[0]!.IDTabla, Motivo: "Corrección" },
          treasuryRecord.version,
        ),
      );
      assert.equal((await readN()).registro.ProximoNumero, initial);
      const c = await good<MasterDetail>(
        await req("maestros/comprobantes/NS_TI"),
      );
      await good(
        await req(
          "maestros/comprobantes/NS_TI",
          "PUT",
          { ...c.registro, Numerador: null },
          c.version,
        ),
      );
      const n = await readN();
      assert.equal(
        (
          await req(
            "maestros/numeraciones/NS_GENERAL",
            "PUT",
            { ...n.registro, ProximoNumero: "100000003" },
            n.version,
          )
        ).status,
        409,
      );
      assert.equal(
        (await req("maestros/numeraciones/NS_GENERAL", "DELETE", {}, n.version))
          .status,
        409,
      );
      assert.equal(
        (
          await rows(
            "SELECT * FROM NUMERACIONUSO WHERE Comprobante='NS_TI' AND NumeroComprobante=100000003",
          )
        ).length,
        1,
      );
      const current = await good<MasterDetail>(
        await req("maestros/comprobantes/NS_TI"),
      );
      await good(
        await req(
          "maestros/comprobantes/NS_TI",
          "PUT",
          { ...current.registro, Numerador: "NS_GENERAL" },
          current.version,
        ),
      );
    },
  );
  await t.test(
    "fallo posterior revierte consumo, movimiento, correlativo y solicitud idempotente",
    async () => {
      const before = await readN(),
        key = randomUUID(),
        count = Number(
          (await rows("SELECT COUNT(*) AS n FROM NUMERACIONUSO"))[0]!.n,
        );
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_NS_FAIL");
      try {
        assert.equal(
          (await req("tesoreria", "POST", treasury(), undefined, key)).status,
          500,
        );
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_NS_FAIL TO AUDITORIA");
      }
      assert.equal(
        (await readN()).registro.ProximoNumero,
        before.registro.ProximoNumero,
      );
      assert.equal(
        Number((await rows("SELECT COUNT(*) AS n FROM NUMERACIONUSO"))[0]!.n),
        count,
      );
      assert.equal(
        (await rows("SELECT Clave FROM SOLICITUD WHERE Clave=?", [key])).length,
        0,
      );
      const saved = await good<CashDetail>(
        await req("tesoreria", "POST", treasury(), undefined, key),
        201,
      );
      assert.equal(
        saved.registro.NumeroComprobante,
        before.registro.ProximoNumero,
      );
    },
  );
  await t.test(
    "asociar historia previa requiere un próximo número seguro y conserva los movimientos",
    async () => {
      await good(
        await master("comprobantes", {
          Codigo: "NS_OLD",
          Descripcion: "Historia manual",
          ModuloOrigen: "CUENTACORRIENTE",
          Cuenta: "COBRAR",
          Naturaleza: "DEUDA",
          SentidoFondos: "NOAPLICA",
          Activo: true,
        }),
        201,
      );
      const old = await good<CurrentAccountDetail>(
        await req(
          "cuenta-corriente",
          "POST",
          cc("NS_OLD", {
            NumeroAutomatico: false,
            NumeroComprobante: "100000500",
          }),
        ),
        201,
      );
      const c = await good<MasterDetail>(
        await req("maestros/comprobantes/NS_OLD"),
      );
      const conflict = await req(
        "maestros/comprobantes/NS_OLD",
        "PUT",
        { ...c.registro, Numerador: "NS_GENERAL" },
        c.version,
      );
      assert.equal(conflict.status, 409);
      assert.ok(
        ((await conflict.json()) as { campos: Record<string, string> }).campos
          .Numerador,
      );
      await updateN("NS_GENERAL", { ProximoNumero: "100000501" });
      await good(
        await req(
          "maestros/comprobantes/NS_OLD",
          "PUT",
          { ...c.registro, Numerador: "NS_GENERAL" },
          c.version,
        ),
      );
      const fresh = await good<CurrentAccountDetail>(
        await req("cuenta-corriente", "POST", cc("NS_OLD")),
        201,
      );
      assert.equal(fresh.registro.NumeroComprobante, "100000501");
      const preserved = await good<CurrentAccountDetail>(
        await req("cuenta-corriente/" + old.registro.IDTabla),
      );
      assert.equal(preserved.registro.NumeroComprobante, "100000500");
    },
  );
  await t.test(
    "los consumos impiden borrar o retroceder aun después de quitar todas las asociaciones",
    async () => {
      await good(
        await master("numeraciones", {
          Codigo: "NS_ARCH",
          ProximoNumero: "300000001",
          Activo: true,
        }),
        201,
      );
      await good(
        await master("comprobantes", {
          Codigo: "NS_ARCH_C",
          Descripcion: "Archivado",
          ModuloOrigen: "CUENTACORRIENTE",
          Cuenta: "COBRAR",
          Naturaleza: "DEUDA",
          SentidoFondos: "NOAPLICA",
          Numerador: "NS_ARCH",
          Activo: true,
        }),
        201,
      );
      await good(await req("cuenta-corriente", "POST", cc("NS_ARCH_C")), 201);
      const c = await good<MasterDetail>(
        await req("maestros/comprobantes/NS_ARCH_C"),
      );
      await good(
        await req(
          "maestros/comprobantes/NS_ARCH_C",
          "PUT",
          { ...c.registro, Numerador: null },
          c.version,
        ),
      );
      const n = await readN("NS_ARCH");
      assert.equal(
        (await req("maestros/numeraciones/NS_ARCH", "DELETE", {}, n.version))
          .status,
        409,
      );
      assert.equal(
        (
          await req(
            "maestros/numeraciones/NS_ARCH",
            "PUT",
            { ...n.registro, ProximoNumero: "300000001" },
            n.version,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "la reversión exige numerador válido para la caja y continúa en otra jornada de la misma caja",
    async () => {
      await good(
        await master("comprobantes", {
          Codigo: "NS_REV",
          Descripcion: "Reversión por caja",
          ModuloOrigen: "TESORERIA",
          Cuenta: "NOAPLICA",
          Naturaleza: "NOAPLICA",
          SentidoFondos: "EGRESO",
          EsReversion: true,
          Numerador: "NS_BOX",
          Activo: true,
        }),
        201,
      );
      const c = await good<MasterDetail>(
        await req("maestros/comprobantes/NS_TI"),
      );
      await good(
        await req(
          "maestros/comprobantes/NS_TI",
          "PUT",
          { ...c.registro, ComprobanteReversion: "NS_REV" },
          c.version,
        ),
      );
      const d = await good<CashDetail>(
        await req("tesoreria", "POST", treasury()),
        201,
      );
      const options = await good<CashOptions>(
        await req("caja-movimiento/opciones"),
      );
      const box = options.aperturas.find(
        (o) => o.IDTabla === boxes[0]!.IDTabla,
      )!;
      await good(
        await req("caja-movimiento/cajas/" + box.IDTabla + "/cerrar", "POST", {
          SaldoContado: box.SaldoActual,
          Observacion: null,
        }),
      );
      assert.equal(
        (
          await req(
            "tesoreria/" +
              d.registro.IDTabla +
              "/reversion?CajaSaldo=" +
              boxes[1]!.IDTabla,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "tesoreria/" + d.registro.IDTabla + "/revertir",
            "POST",
            { CajaSaldo: boxes[1]!.IDTabla, Motivo: "Otra caja" },
            d.version,
          )
        ).status,
        409,
      );
      const current = await open("NS_A");
      assert.notEqual(current.IDTabla, box.IDTabla);
      const preview = await good<{
        Comprobante: string;
        NumeroComprobante: string;
      }>(
        await req(
          "tesoreria/" +
            d.registro.IDTabla +
            "/reversion?CajaSaldo=" +
            current.IDTabla,
        ),
      );
      assert.equal(preview.Comprobante, "NS_REV");
      const reverse = await good<CashDetail>(
        await req(
          "tesoreria/" + d.registro.IDTabla + "/revertir",
          "POST",
          { CajaSaldo: current.IDTabla, Motivo: "Corrección histórica" },
          d.version,
        ),
      );
      assert.equal(
        reverse.registro.NumeroComprobante,
        preview.NumeroComprobante,
      );
      assert.equal(reverse.registro.CajaMovimientoOrigen, d.registro.IDTabla);
    },
  );
});
