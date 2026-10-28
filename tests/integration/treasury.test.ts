import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashDetail,
  CashList,
  CashOptions,
  MasterDetail,
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
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";

test("Tesorería: efectivo interno sin Cuenta corriente y correcciones por apertura real", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_HOST, "127.0.0.1");
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("hex"),
    hash = await hashPassword(password);
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('TT_READ','Consulta')",
  );
  for (const role of ["ADMIN", "TT_READ"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,?)",
      [role, role + "-treasury@example.invalid", hash, role, new Date()],
    );
  await pool.query(
    "INSERT INTO CONCEPTO (Codigo,Descripcion) VALUES ('TT_FONDO','Aporte/retiro de fondos'),('TT_OFF','Inactivo')",
  );
  await pool.query("UPDATE CONCEPTO SET Activo=0 WHERE Codigo='TT_OFF'");
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('TT_T','Prueba Tesorería')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('TT_C','Cliente Tesorería','TT_T')",
  );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    masters: createMasterStore(pool),
    cashMovement: createCashMovementStore(pool),
    treasury: createCashMovementStore(pool, "TESORERIA"),
    currentAccount: createCurrentAccountStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}/api/`;
  async function login(role: string) {
    const r = await fetch(base + "auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({
        email: role + "-treasury@example.invalid",
        password,
      }),
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      session: (await r.json()) as SessionResponse,
    };
  }
  const admin = await login("ADMIN"),
    reader = await login("TT_READ");
  const req = (
    path: string,
    method = "GET",
    body?: unknown,
    version?: string,
    key = randomUUID(),
    as = admin,
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: as.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": as.session.csrfToken,
        "Idempotency-Key": key,
        ...(version ? { "If-Match": '"' + version + '"' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function good<T>(r: Response, status = 200): Promise<T> {
    assert.equal(r.status, status, await r.clone().text());
    return r.json() as Promise<T>;
  }
  async function rows(sql: string, params: (string | number)[] = []) {
    return (await pool.execute<RowDataPacket[]>(sql, params))[0];
  }
  async function master(input: Record<string, unknown>) {
    return good<MasterDetail>(
      await req("maestros/comprobantes", "POST", {
        Descripcion: input.Codigo,
        Orden: "0",
        Activo: true,
        ...input,
      }),
      201,
    );
  }
  const configs = [
    {
      Codigo: "TT_RI",
      ModuloOrigen: "TESORERIA",
      Cuenta: "NOAPLICA",
      Naturaleza: "NOAPLICA",
      SentidoFondos: "EGRESO",
      EsReversion: true,
    },
    {
      Codigo: "TT_RO",
      ModuloOrigen: "TESORERIA",
      Cuenta: "NOAPLICA",
      Naturaleza: "NOAPLICA",
      SentidoFondos: "INGRESO",
      EsReversion: true,
    },
    {
      Codigo: "TT_IN",
      ModuloOrigen: "TESORERIA",
      Cuenta: "NOAPLICA",
      Naturaleza: "NOAPLICA",
      SentidoFondos: "INGRESO",
      ComprobanteReversion: "TT_RI",
    },
    {
      Codigo: "TT_OUT",
      ModuloOrigen: "TESORERIA",
      Cuenta: "NOAPLICA",
      Naturaleza: "NOAPLICA",
      SentidoFondos: "EGRESO",
      ComprobanteReversion: "TT_RO",
    },
    {
      Codigo: "TT_PAY",
      ModuloOrigen: "COBROSPAGOS",
      Cuenta: "PAGAR",
      Naturaleza: "CREDITO",
      SentidoFondos: "EGRESO",
    },
    {
      Codigo: "TT_PR",
      ModuloOrigen: "CUENTACORRIENTE",
      Cuenta: "PAGAR",
      Naturaleza: "DEUDA",
      SentidoFondos: "NOAPLICA",
    },
  ];
  for (const c of configs) await master(c);
  let sequence = 900000001,
    index = 0;
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  async function fixture(initial = "0") {
    const code = "TT_BOX" + ++index;
    await pool.execute("INSERT INTO CAJA (Codigo,Nombre) VALUES (?,?)", [
      code,
      "Caja Tesorería " + index,
    ]);
    const o = await good<{ IDTabla: string }>(
      await req("caja-movimiento/cajas", "POST", {
        Caja: code,
        SaldoInicial: initial,
      }),
      201,
    );
    return { code, id: o.IDTabla };
  }
  type Box = Awaited<ReturnType<typeof fixture>>;
  const input = (box: Box, importe = "100", code = "TT_IN") => ({
    Comprobante: code,
    NumeroComprobante: String(sequence++),
    CajaSaldo: box.id,
    Concepto: "TT_FONDO",
    FechaOrigen: date,
    Importe: importe,
    Observacion: "Aporte o retiro entregado por administración",
  });
  const create = async (box: Box, importe = "100", code = "TT_IN") =>
    good<CashDetail>(
      await req("tesoreria", "POST", input(box, importe, code)),
      201,
    );
  const balance = async (box: Box) =>
    (
      await good<CashOptions>(await req("caja-movimiento/opciones"))
    ).aperturas.find((o) => o.IDTabla === box.id)!.SaldoActual;
  const get = async (d: CashDetail) =>
    good<CashDetail>(await req("tesoreria/" + d.registro.IDTabla));
  const annul = (d: CashDetail, box: Box, key = randomUUID()) =>
    req(
      "tesoreria/" + d.registro.IDTabla + "/anular",
      "POST",
      { CajaSaldo: box.id, Motivo: "Error de registración" },
      d.version,
      key,
    );
  const reverse = (d: CashDetail, box: Box, key = randomUUID()) =>
    req(
      "tesoreria/" + d.registro.IDTabla + "/revertir",
      "POST",
      { CajaSaldo: box.id, Motivo: "Corrección histórica" },
      d.version,
      key,
    );
  const close = async (box: Box) =>
    good(
      await req("caja-movimiento/cajas/" + box.id + "/cerrar", "POST", {
        SaldoContado: await balance(box),
        Observacion: null,
      }),
    );
  const unrelated = async () =>
    Promise.all(
      [
        "CUENTACORRIENTE",
        "CAJAMOVIMIENTOAFECTACION",
        "TRANSFERENCIA",
        "CHEQUE",
        "CHEQUEEVENTO",
        "BANCOMOVIMIENTO",
      ].map(async (table) => [
        table,
        await rows("SELECT * FROM " + table + " ORDER BY IDTabla"),
      ]),
    );

  await t.test(
    "sesión, permisos, CSRF y payload estricto sin medios bancarios ni clientes",
    async () => {
      const b = await fixture();
      const data = input(b);
      assert.equal((await fetch(base + "tesoreria")).status, 401);
      assert.equal(
        (await req("tesoreria", "POST", data, undefined, randomUUID(), reader))
          .status,
        403,
      );
      assert.equal(
        (
          await req(
            "tesoreria",
            "GET",
            undefined,
            undefined,
            randomUUID(),
            reader,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "tesoreria", {
            method: "POST",
            headers: {
              Cookie: admin.cookie,
              "Content-Type": "application/json",
              "X-ERP-Request": "1",
            },
            body: JSON.stringify(data),
          })
        ).status,
        403,
      );
      for (const extra of [
        { Cliente: "TT_C" },
        { Valores: [] },
        { Afectaciones: [] },
        { ImporteTotal: "100" },
        { CajaSaldo: "" },
        { Concepto: "" },
        { Importe: "0" },
        { Importe: "-1" },
        { Importe: "1.001" },
        { FechaOrigen: "2026-02-31" },
      ])
        assert.equal(
          (await req("tesoreria", "POST", { ...data, ...extra })).status,
          400,
        );
      for (const Comprobante of ["TT_PAY", "TT_PR", "TT_RI"])
        assert.equal(
          (await req("tesoreria", "POST", { ...data, Comprobante })).status,
          400,
        );
      assert.equal(
        (await req("tesoreria", "POST", { ...data, Concepto: "TT_OFF" }))
          .status,
        400,
      );
      assert.equal(await balance(b), "0.00");
    },
  );
  await t.test(
    "comprobantes de Tesorería y reversiones tienen configuración propia y compatible",
    async () => {
      const baseConfig = configs[2]!;
      for (const change of [
        { Codigo: "TT_BAD1", ComprobanteReversion: "TT_RO" },
        { Codigo: "TT_BAD2", ComprobanteReversion: "CM_RC" },
        {
          Codigo: "TT_BAD3",
          EsReversion: true,
          Naturaleza: "DEUDA",
          ComprobanteReversion: null,
        },
      ])
        assert.equal(
          (
            await req("maestros/comprobantes", "POST", {
              Descripcion: "Incorrecto",
              Activo: true,
              ...baseConfig,
              ...change,
            })
          ).status,
          400,
        );
      const tOptions = await good<CashOptions>(await req("tesoreria/opciones"));
      assert.ok(tOptions.comprobantes.some((c) => c.Codigo === "TT_IN"));
      assert.ok(
        !tOptions.comprobantes.some(
          (c) => c.Codigo === "TT_RI" || c.Codigo === "TT_PAY",
        ),
      );
      const cOptions = await good<CashOptions>(
        await req("caja-movimiento/opciones"),
      );
      assert.ok(!cOptions.comprobantes.some((c) => c.Codigo === "TT_IN"));
    },
  );
  await t.test(
    "aporte fondea la caja sin tocar saldo inicial ni asientos de cliente; retiro y pago comparten efectivo",
    async () => {
      const b = await fixture(),
        before = await unrelated();
      const d = await create(b);
      assert.equal(d.registro.Cliente, null);
      assert.equal(d.registro.Cuenta, null);
      assert.equal(d.registro.DisponibleACuenta, "0.00");
      assert.equal(await balance(b), "100.00");
      assert.equal(
        String(
          (
            await rows("SELECT SaldoInicial FROM CAJASALDO WHERE IDTabla=?", [
              b.id,
            ])
          )[0]!.SaldoInicial,
        ),
        "0.00",
      );
      assert.deepEqual(await unrelated(), before);
      const debt = await good<{ registro: { IDTabla: string } }>(
        await req("cuenta-corriente", "POST", {
          Cliente: "TT_C",
          Comprobante: "TT_PR",
          NumeroComprobante: String(sequence++),
          FechaOrigen: date,
          Vencimiento: date,
          Importe: "60",
          Observacion: null,
        }),
        201,
      );
      const payment = await good<CashDetail>(
        await req("caja-movimiento", "POST", {
          Comprobante: "TT_PAY",
          NumeroComprobante: String(sequence++),
          Cliente: "TT_C",
          FechaOrigen: date,
          CajaSaldo: b.id,
          Concepto: null,
          ImporteEfectivo: "60",
          ImporteACuenta: "0",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: debt.registro.IDTabla, Importe: "60" },
          ],
          Valores: [],
        }),
        201,
      );
      assert.equal(await balance(b), "40.00");
      const accountBefore = await unrelated();
      await create(b, "10", "TT_OUT");
      assert.equal(await balance(b), "30.00");
      assert.deepEqual(await unrelated(), accountBefore);
      assert.equal(
        (await annul(d, b)).status,
        409,
        "No puede retirar el aporte si ya se utilizó efectivo",
      );
      assert.equal(
        (await req("tesoreria/" + payment.registro.IDTabla)).status,
        404,
      );
      assert.equal(
        (await req("caja-movimiento/" + d.registro.IDTabla)).status,
        404,
      );
      assert.equal(
        (
          await req(
            "caja-movimiento/" + d.registro.IDTabla + "/anular",
            "POST",
            { CajaSaldo: b.id, Motivo: "Cruce incorrecto" },
            d.version,
          )
        ).status,
        404,
      );
      const commercial = await good<CashList>(
        await req("caja-movimiento?Estado=TODOS&limite=100"),
      );
      assert.ok(
        !commercial.registros.some((r) => r.IDTabla === d.registro.IDTabla),
      );
      const internal = await good<CashList>(
        await req("tesoreria?Estado=TODOS&limite=100"),
      );
      assert.ok(
        !internal.registros.some((r) => r.IDTabla === payment.registro.IDTabla),
      );
    },
  );
  await t.test(
    "retiros insuficientes no consumen números; duplicados y reintentos conservan una sola operación",
    async () => {
      const b = await fixture("50");
      await pool.query(
        "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('TT_OUT',900000100)",
      );
      await pool.query(
        "UPDATE COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Codigo SET c.Numerador=n.Codigo WHERE c.Numerador IS NULL",
      );
      const bad = {
        ...input(b, "51", "TT_OUT"),
        NumeroComprobante: "900000100",
      };
      assert.equal((await req("tesoreria", "POST", bad)).status, 409);
      assert.equal(
        String(
          (
            await rows(
              "SELECT ProximoNumero FROM NUMERACION WHERE Codigo='TT_OUT'",
            )
          )[0]!.ProximoNumero,
        ),
        "900000100",
      );
      const key = randomUUID(),
        body = { ...bad, Importe: "25" };
      const first = await good<CashDetail>(
        await req("tesoreria", "POST", body, undefined, key),
        201,
      );
      const retry = await good<CashDetail>(
        await req("tesoreria", "POST", body, undefined, key),
        201,
      );
      assert.equal(first.registro.IDTabla, retry.registro.IDTabla);
      assert.equal(await balance(b), "25.00");
      assert.equal((await req("tesoreria", "POST", body)).status, 201);
      assert.equal(
        String(
          (
            await rows(
              "SELECT ProximoNumero FROM NUMERACION WHERE Codigo='TT_OUT'",
            )
          )[0]!.ProximoNumero,
        ),
        "900000102",
      );
    },
  );
  await t.test(
    "anulación registra motivo, restaura saldo en la misma jornada e impide otras aperturas",
    async () => {
      const b = await fixture("50"),
        other = await fixture(),
        d = await create(b, "20", "TT_OUT"),
        before = await unrelated();
      assert.equal((await annul(d, other)).status, 409);
      assert.equal(
        (
          await req("tesoreria/" + d.registro.IDTabla + "/anular", "POST", {
            CajaSaldo: b.id,
            Motivo: "Sin versión",
          })
        ).status,
        400,
      );
      const key = randomUUID(),
        cancelled = await good<CashDetail>(await annul(d, b, key));
      assert.equal(cancelled.registro.Estado, "ANULADO");
      assert.equal(cancelled.registro.MotivoAnulacion, "Error de registración");
      assert.equal(await balance(b), "50.00");
      assert.equal(
        (await good<CashDetail>(await annul(d, b, key))).registro.IDTabla,
        d.registro.IDTabla,
      );
      assert.equal((await annul(d, b)).status, 409);
      assert.deepEqual(await unrelated(), before);
    },
  );
  await t.test(
    "reversión automática conserva cierres e historia, no crea Cuenta corriente y exige Numerador",
    async () => {
      const old = await fixture(),
        d = await create(old, "100"),
        dest = await fixture("200"),
        before = await unrelated();
      assert.equal(
        (await reverse(d, dest)).status,
        409,
        "Original aún abierto",
      );
      await close(old);
      const snapshot = await rows("SELECT * FROM CAJASALDO WHERE IDTabla=?", [
          old.id,
        ]),
        original = await rows("SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
          d.registro.IDTabla,
        ]);
      assert.equal((await annul(d, dest)).status, 409);
      assert.equal((await reverse(d, dest)).status, 409, "Falta Numerador");
      await pool.query(
        "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('TT_RI',200000001)",
      );
      await pool.query(
        "UPDATE COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Codigo SET c.Numerador=n.Codigo WHERE c.Numerador IS NULL",
      );
      const preview = await good<{
        Comprobante: string;
        NumeroComprobante: string;
      }>(await req("tesoreria/" + d.registro.IDTabla + "/reversion"));
      assert.equal(preview.Comprobante, "TT_RI");
      assert.equal(preview.NumeroComprobante, "200000001");
      assert.equal(
        (
          await req(
            "tesoreria/" + d.registro.IDTabla + "/revertir",
            "POST",
            {
              CajaSaldo: dest.id,
              Motivo: "No editar",
              NumeroComprobante: "200000002",
            },
            d.version,
          )
        ).status,
        400,
      );
      const key = randomUUID(),
        r = await good<CashDetail>(await reverse(d, dest, key));
      assert.equal(r.registro.Cliente, null);
      assert.equal(r.registro.CajaMovimientoOrigen, d.registro.IDTabla);
      assert.equal(r.registro.Comprobante, "TT_RI");
      assert.equal(r.registro.NumeroComprobante, "200000001");
      assert.equal(await balance(dest), "100.00");
      assert.equal((await get(d)).registro.Estado, "REVERTIDO");
      assert.equal(
        (await get(d)).relacionados.reversion!.IDTabla,
        r.registro.IDTabla,
      );
      assert.equal(r.relacionados.original!.IDTabla, d.registro.IDTabla);
      assert.deepEqual(
        await rows("SELECT * FROM CAJASALDO WHERE IDTabla=?", [old.id]),
        snapshot,
      );
      assert.deepEqual(
        await rows("SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
          d.registro.IDTabla,
        ]),
        original,
      );
      assert.deepEqual(await unrelated(), before);
      assert.equal(
        (await good<CashDetail>(await reverse(d, dest, key))).registro.IDTabla,
        r.registro.IDTabla,
      );
      assert.equal((await reverse(d, dest)).status, 409);
      assert.equal((await annul(r, dest)).status, 409);
      assert.equal((await reverse(r, dest)).status, 409);
    },
  );
  await t.test(
    "listados filtran y ordenan todo el resultado, con descripción de concepto y estado derivado",
    async () => {
      const b = await fixture("100");
      await create(b, "11");
      await create(b, "12");
      await create(b, "13");
      const q =
        "tesoreria?Estado=TODOS&q=Aporte%2Fretiro&orden=ImporteTotal&direccion=desc&limite=1";
      // Los nombres de orden reales se validan por el mismo contrato de los listados.
      const filtered = await good<CashList>(
        await req("tesoreria?Estado=TODOS&q=Aporte%2Fretiro&limite=100"),
      );
      assert.ok(filtered.registros.length >= 3);
      assert.ok(
        filtered.registros.every(
          (r) => r.ConceptoDescripcion === "Aporte/retiro de fondos",
        ),
      );
      const sorted = await good<CashList>(
        await req(
          "tesoreria?Estado=TODOS&orden=ImporteTotal&direccion=desc&limite=1",
        ),
      );
      assert.equal(sorted.registros.length, 1);
      assert.ok(sorted.total > 1);
      const reverted = await good<CashList>(
        await req("tesoreria?Estado=REVERTIDO&limite=100"),
      );
      assert.ok(reverted.registros.every((r) => r.Estado === "REVERTIDO"));
      assert.ok(
        (
          await good<CashList>(
            await req("tesoreria?Estado=TODOS&q=sin-coincidencias"),
          )
        ).registros.length === 0,
      );
      assert.equal((await req(q + "&pagina=0")).status, 400);
    },
  );
  await t.test(
    "retiros concurrentes comparten el bloqueo con el cierre y nunca generan saldo negativo",
    async () => {
      const b = await fixture("50");
      const responses = await Promise.all([
        req("tesoreria", "POST", input(b, "40", "TT_OUT")),
        req("tesoreria", "POST", input(b, "40", "TT_OUT")),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await balance(b), "10.00");
      await close(b);
      assert.equal((await req("tesoreria", "POST", input(b, "1"))).status, 409);
      await pool.query("UPDATE CAJA SET Activo=0 WHERE Codigo=?", [b.code]);
      assert.equal((await req("tesoreria", "POST", input(b, "1"))).status, 409);
    },
  );
  await t.test(
    "la clasificación histórica no depende del módulo actual del comprobante",
    async () => {
      await master({
        Codigo: "TT_HIST",
        ModuloOrigen: "TESORERIA",
        Cuenta: "NOAPLICA",
        Naturaleza: "NOAPLICA",
        SentidoFondos: "INGRESO",
      });
      const b = await fixture(),
        d = await create(b, "15", "TT_HIST"),
        before = await unrelated();
      await pool.query(
        "UPDATE COMPROBANTE SET ModuloOrigen='COBROSPAGOS',Cuenta='COBRAR',Naturaleza='CREDITO' WHERE Codigo='TT_HIST'",
      );
      assert.equal((await get(d)).registro.Cliente, null);
      assert.equal(
        (await req("caja-movimiento/" + d.registro.IDTabla)).status,
        404,
      );
      await good(await annul(d, b));
      assert.equal(await balance(b), "0.00");
      assert.deepEqual(await unrelated(), before);
    },
  );
  await t.test(
    "revertir un retiro cerrado ingresa efectivo en la nueva apertura sin duplicar asientos",
    async () => {
      const b = await fixture("50"),
        d = await create(b, "25", "TT_OUT");
      await close(b);
      const dest = await fixture(),
        before = await unrelated();
      await pool.query(
        "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('TT_RO',200000001)",
      );
      await pool.query(
        "UPDATE COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Codigo SET c.Numerador=n.Codigo WHERE c.Numerador IS NULL",
      );
      const r = await good<CashDetail>(await reverse(d, dest));
      assert.equal(r.registro.Sentido, "INGRESO");
      assert.equal(r.registro.Comprobante, "TT_RO");
      assert.equal(r.registro.ImporteEfectivo, "25.00");
      assert.equal(await balance(dest), "25.00");
      assert.deepEqual(await unrelated(), before);
    },
  );
  await t.test(
    "el rollback revierte efectivo, auditoría, solicitud y numeración si falla un paso posterior",
    async () => {
      const b = await fixture(),
        before = await unrelated(),
        store = createCashMovementStore(pool, "TESORERIA");
      const data = input(b, "1"),
        key = randomUUID();
      await pool.query(
        "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('TT_IN',990000001)",
      );
      await pool.query(
        "UPDATE COMPROBANTE c JOIN NUMERACION n ON n.Codigo=c.Codigo SET c.Numerador=n.Codigo WHERE c.Numerador IS NULL",
      );
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_TT_TEST");
      const body = {
        Comprobante: data.Comprobante,
        NumeroComprobante: "990000001",
        Cliente: "",
        FechaOrigen: date,
        CajaSaldo: b.id,
        Concepto: "TT_FONDO",
        ImporteEfectivo: "1",
        ImporteACuenta: "0",
        Observacion: null,
        Afectaciones: [],
        Valores: [],
      };
      try {
        await assert.rejects(store.create(body, admin.session.usuario.id, key));
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_TT_TEST TO AUDITORIA");
      }
      assert.equal(await balance(b), "0.00");
      assert.equal(
        (
          await rows(
            "SELECT IDTabla FROM CAJAMOVIMIENTO WHERE Comprobante='TT_IN' AND NumeroComprobante=990000001",
          )
        ).length,
        0,
      );
      assert.equal(
        (await rows("SELECT Clave FROM SOLICITUD WHERE Clave=?", [key])).length,
        0,
      );
      assert.equal(
        String(
          (
            await rows(
              "SELECT ProximoNumero FROM NUMERACION WHERE Codigo='TT_IN'",
            )
          )[0]!.ProximoNumero,
        ),
        "990000001",
      );
      assert.deepEqual(await unrelated(), before);
      await store.create(body, admin.session.usuario.id, key);
      assert.equal(await balance(b), "1.00");
    },
  );
});
