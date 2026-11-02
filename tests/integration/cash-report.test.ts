import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashDetail,
  CurrentAccountDetail,
  DailyCashReport,
  SessionResponse,
  UserDetail,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createReportStore } from "../../apps/api/src/reports/store.js";
import { createUserStore } from "../../apps/api/src/users/store.js";

test("Informe diario: jornadas reales, flujos físicos y conservación de cierres", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador')",
  );
  await pool.execute(
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Responsable prueba','cash-report@example.invalid',?,'ADMIN',?)",
    [await hashPassword(password), new Date()],
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('CR_T','Tipo prueba')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('CR_CLIENT','Cliente prueba','CR_T')",
  );
  await pool.query(
    "INSERT INTO CONCEPTO (Codigo,Descripcion) VALUES ('CR_FUND','Fondos internos')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('CR_BOX','Caja principal informe'),('CR_EDGE','Caja límites'),('CR_NULL','Cierre incompleto'),('CR_BIG','Precisión'),('CR_MANY','Muchas jornadas')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('CR_BANK','Banco informe')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Nombre,Banco,Titular) VALUES ('CR_ACCOUNT','Cuenta informe','CR_BANK','ERP')",
  );
  for (const [code, account, nature, sense, module] of [
    ["CR_D", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["CR_PR", "PAGAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["CR_C", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["CR_P", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["CR_TI", "NOAPLICA", "NOAPLICA", "INGRESO", "TESORERIA"],
    ["CR_TO", "NOAPLICA", "NOAPLICA", "EGRESO", "TESORERIA"],
    ["CR_RC", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
    ["CR_RT", "NOAPLICA", "NOAPLICA", "EGRESO", "TESORERIA"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, sense, module],
    );
  for (const [normal, reverse] of [
    ["CR_C", "CR_RC"],
    ["CR_TI", "CR_RT"],
  ]) {
    await pool.execute(
      "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES (?,600000001)",
      [reverse],
    );
    await pool.execute(
      "UPDATE COMPROBANTE SET EsReversion=1,Numerador=? WHERE Codigo=?",
      [reverse, reverse],
    );
    await pool.execute(
      "UPDATE COMPROBANTE SET ComprobanteReversion=? WHERE Codigo=?",
      [reverse, normal],
    );
  }
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    masters: createMasterStore(pool),
    users: createUserStore(pool),
    reports: createReportStore(pool),
    currentAccount: createCurrentAccountStore(pool),
    cashMovement: createCashMovementStore(pool),
    treasury: createCashMovementStore(pool, "TESORERIA"),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port + "/api";
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  async function login(email: string) {
    const r = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Request": "1" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      session: (await r.json()) as SessionResponse,
    };
  }
  const admin = await login("cash-report@example.invalid");
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    who = admin,
    version?: string,
  ) {
    return fetch(base + path, {
      method,
      headers: {
        Cookie: who.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": who.session.csrfToken,
        "Idempotency-Key": randomUUID(),
        ...(version ? { "If-Match": `"${version}"` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function json<T>(r: Response, status = 200) {
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data as T;
  }
  const report = async (q = "Caja=CR_BOX&continuo=1") =>
    json<DailyCashReport>(await req("/informes/caja/diario?" + q));
  let number = 500000001,
    first: string,
    second: string,
    receipt: CashDetail,
    treasuryIn: CashDetail;
  const debt = async (voucher: string, amount: string) =>
    json<CurrentAccountDetail>(
      await req("/cuenta-corriente", "POST", {
        Cliente: "CR_CLIENT",
        Comprobante: voucher,
        NumeroComprobante: String(number++),
        FechaOrigen: "2026-10-20",
        Vencimiento: "2026-10-30",
        Importe: amount,
        Observacion: null,
      }),
      201,
    );
  const internal = async (voucher: string, amount: string) =>
    json<CashDetail>(
      await req("/tesoreria", "POST", {
        Comprobante: voucher,
        NumeroComprobante: String(number++),
        CajaSaldo: first,
        Concepto: "CR_FUND",
        FechaOrigen: "2026-10-25",
        Importe: amount,
        Observacion: null,
      }),
      201,
    );
  async function pay(debtId: string, amount: string, transfer = false) {
    return json<CashDetail>(
      await req("/caja-movimiento", "POST", {
        Comprobante: "CR_P",
        NumeroComprobante: String(number++),
        Cliente: "CR_CLIENT",
        CajaSaldo: first,
        FechaOrigen: "2026-10-28",
        Concepto: null,
        ImporteEfectivo: transfer ? "0.00" : amount,
        ImporteACuenta: "0.00",
        Observacion: null,
        Afectaciones: [{ CuentaCorriente: debtId, Importe: amount }],
        Valores: transfer
          ? [
              {
                Tipo: "TRANSFERENCIA",
                BancoCuenta: "CR_ACCOUNT",
                Importe: amount,
                Referencia: "Pago informe",
              },
            ]
          : [],
      }),
      201,
    );
  }
  await t.test(
    "permiso independiente de consulta, filtros estrictos y referencias acotadas",
    async () => {
      assert.equal((await fetch(base + "/informes/caja/diario")).status, 401);
      const input = {
        nombre: "Consulta caja",
        email: "cash-report-reader@example.invalid",
        activo: true,
        password,
        permisos: [{ menu: "resumen-diario-caja", escritura: false }],
      };
      await json<UserDetail>(await req("/usuarios", "POST", input), 201);
      const reader = await login(input.email);
      assert.equal(
        (await req("/informes/caja/diario", "GET", undefined, reader)).status,
        200,
      );
      for (const path of [
        "/caja-movimiento",
        "/tesoreria",
        "/cuenta-corriente",
        "/maestros/cajas",
        "/informes/cuenta-corriente",
      ])
        assert.equal((await req(path, "GET", undefined, reader)).status, 403);
      assert.equal(
        (await req("/referencias/cajas?estado=todos", "GET", undefined, reader))
          .status,
        200,
      );
      assert.equal(
        (
          await req("/usuarios", "POST", {
            ...input,
            email: "cash-report-write@example.invalid",
            permisos: [{ menu: "resumen-diario-caja", escritura: true }],
          })
        ).status,
        400,
      );
      for (const q of [
        "Estado=CONFIRMADO",
        "Desde=2026-02-30",
        "Desde=2026-10-29&Hasta=2026-10-28",
        "Hasta=texto",
        "orden=IDTabla&direccion=asc",
        "orden=Teorico&direccion=inyeccion",
        "Caja=",
        "continuo=2",
      ])
        assert.equal((await req("/informes/caja/diario?" + q)).status, 400, q);
      assert.equal((await report("Caja=CR_BOX")).total, 0);
    },
  );
  await t.test(
    "multimedio/multiafectación: efectivo separado y anulación sin efecto",
    async () => {
      first = (
        await json<{ IDTabla: string }>(
          await req("/caja-movimiento/cajas", "POST", {
            Caja: "CR_BOX",
            SaldoInicial: "0.00",
          }),
          201,
        )
      ).IDTabla;
      treasuryIn = await internal("CR_TI", "100.00");
      const d1 = await debt("CR_D", "200.00"),
        d2 = await debt("CR_D", "100.00"),
        prize = await debt("CR_PR", "300.00");
      receipt = await json<CashDetail>(
        await req("/caja-movimiento", "POST", {
          Comprobante: "CR_C",
          NumeroComprobante: String(number++),
          Cliente: "CR_CLIENT",
          CajaSaldo: first,
          FechaOrigen: "2026-10-28",
          Concepto: null,
          ImporteEfectivo: "50.00",
          ImporteACuenta: "0.00",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: d1.registro.IDTabla, Importe: "200.00" },
            { CuentaCorriente: d2.registro.IDTabla, Importe: "100.00" },
          ],
          Valores: [
            {
              Tipo: "TRANSFERENCIA",
              BancoCuenta: "CR_ACCOUNT",
              Importe: "100.00",
              Referencia: "Cobro informe",
            },
            {
              Tipo: "TERCERO",
              Banco: "CR_BANK",
              BancoCuenta: null,
              CuentaLibradora: "999",
              Numero: "123123",
              Librador: "Tercero",
              Documento: null,
              Emision: "2026-10-20",
              Vencimiento: "2026-10-30",
              Importe: "150.00",
            },
          ],
        }),
        201,
      );
      await pay(prize.registro.IDTabla, "60.00");
      await internal("CR_TO", "10.00");
      const cancelled = await pay(prize.registro.IDTabla, "20.00");
      await json(
        await req(
          "/caja-movimiento/" + cancelled.registro.IDTabla + "/anular",
          "POST",
          { CajaSaldo: first, Motivo: "Error registral" },
          admin,
          cancelled.version,
        ),
      );
      await pay(prize.registro.IDTabla, "100.00", true);
      const r = await report();
      assert.equal(r.total, 1);
      const o = r.registros[0]!;
      assert.equal(o.IngresosEfectivo, "150.00");
      assert.equal(o.EgresosEfectivo, "70.00");
      assert.equal(o.Teorico, "80.00");
      assert.equal(o.TeoricoCalculado, "80.00");
      assert.equal(o.IngresosComerciales, "50.00");
      assert.equal(o.EgresosComerciales, "60.00");
      assert.equal(o.IngresosTesoreria, "100.00");
      assert.equal(o.EgresosTesoreria, "10.00");
      assert.equal(o.IngresosOtrosMedios, "250.00");
      assert.equal(o.EgresosOtrosMedios, "100.00");
      assert.equal(o.Movimientos, 5);
      assert.equal(o.SaldoContado, null);
      assert.equal(o.Diferencia, null);
      assert.equal(o.CierreCoincide, null);
      assert.equal(r.totales.Diferencia, null);
    },
  );
  await t.test(
    "cierre guardado y reversos en una apertura nueva sin tocar historia",
    async () => {
      await json(
        await req("/caja-movimiento/cajas/" + first + "/cerrar", "POST", {
          SaldoContado: "75.00",
          Observacion: "Faltante de prueba",
        }),
      );
      second = (
        await json<{ IDTabla: string }>(
          await req("/caja-movimiento/cajas", "POST", {
            Caja: "CR_BOX",
            SaldoInicial: "200.00",
          }),
          201,
        )
      ).IDTabla;
      for (const [path, record] of [
        ["/caja-movimiento/", receipt],
        ["/tesoreria/", treasuryIn],
      ] as const) {
        const current = await json<CashDetail>(
          await req(path + record.registro.IDTabla),
        );
        await json(
          await req(
            path + record.registro.IDTabla + "/revertir",
            "POST",
            { CajaSaldo: second, Motivo: "Contramovimiento real" },
            admin,
            current.version,
          ),
        );
      }
      await pool.execute(
        "UPDATE CAJASALDO SET AperturaEn='2026-10-27 03:00:00',CierreEn='2026-10-27 23:00:00' WHERE IDTabla=?",
        [first],
      );
      await pool.execute(
        "UPDATE CAJASALDO SET AperturaEn='2026-10-28 03:00:00' WHERE IDTabla=?",
        [second],
      );
      const r = await report();
      assert.equal(r.total, 2);
      const old = r.registros.find((o) => o.Clave === first)!,
        fresh = r.registros.find((o) => o.Clave === second)!;
      assert.equal(old.Teorico, "80.00");
      assert.equal(old.SaldoContado, "75.00");
      assert.equal(old.Diferencia, "-5.00");
      assert.equal(old.CierreCoincide, true);
      assert.equal(old.Movimientos, 5);
      assert.equal(fresh.Teorico, "50.00");
      assert.equal(fresh.EgresosComerciales, "50.00");
      assert.equal(fresh.EgresosTesoreria, "100.00");
      assert.equal(fresh.EgresosOtrosMedios, "250.00");
      assert.equal(fresh.Movimientos, 2);
      assert.equal(r.totales.IngresosEfectivo, "150.00");
      assert.equal(r.totales.EgresosEfectivo, "220.00");
      assert.equal(r.totales.Diferencia, "-5.00");
      assert.equal(r.totales.Movimientos, 7);
      assert.equal(r.totales.Abiertas, 1);
      assert.equal(r.totales.Cerradas, 1);
    },
  );
  await t.test(
    "fechas de apertura en Buenos Aires: límites inclusivos y sin recortar movimientos por FechaOrigen",
    async () => {
      const day = await report(
        "Caja=CR_BOX&Desde=2026-10-27&Hasta=2026-10-27&continuo=1",
      );
      assert.equal(day.total, 1);
      assert.equal(day.registros[0]!.Clave, first);
      assert.equal(day.registros[0]!.Teorico, "80.00");
      const next = await report(
        "Caja=CR_BOX&Desde=2026-10-28&Hasta=2026-10-28",
      );
      assert.equal(next.total, 1);
      assert.equal(next.registros[0]!.Clave, second);
      await pool.execute(
        "INSERT INTO CAJASALDO (Caja,AperturaEn,SaldoInicial,UsuarioApertura,Estado) VALUES ('CR_EDGE','2026-10-27 02:59:59.999999',0,?,'ABIERTO'),('CR_EDGE','2026-10-28 02:59:59.999999',0,?,'ABIERTO')",
        [admin.session.usuario.id, admin.session.usuario.id],
      );
      const edge = await report(
        "Caja=CR_EDGE&Desde=2026-10-27&Hasta=2026-10-27",
      );
      assert.equal(edge.total, 1);
      assert.equal(edge.registros[0]!.AperturaEn.slice(0, 10), "2026-10-28");
      assert.equal(
        (await report("Caja=CR_BOX&Estado=CERRADO")).registros[0]!.Clave,
        first,
      );
      assert.equal(
        (await report("Caja=CR_BOX&Estado=ABIERTO")).registros[0]!.Clave,
        second,
      );
      assert.equal(
        (await report("Caja=CR_BOX&Desde=9999-12-31&Hasta=9999-12-31")).total,
        0,
      );
    },
  );
  await t.test(
    "historia independiente de maestros y preservación de un cierre discordante",
    async () => {
      await pool.query("UPDATE CAJA SET Activo=0 WHERE Codigo='CR_BOX'");
      await pool.query(
        "UPDATE COMPROBANTE SET ModuloOrigen='COBROSPAGOS' WHERE Codigo='CR_TI'",
      );
      const r = await report();
      assert.equal(r.total, 2);
      assert.equal(r.registros[0]!.IngresosTesoreria, "100.00");
      await pool.execute(
        "UPDATE CAJASALDO SET SaldoTeorico='79.00' WHERE IDTabla=?",
        [first],
      );
      const changed = (await report("Caja=CR_BOX&Estado=CERRADO"))
        .registros[0]!;
      assert.equal(changed.Teorico, "79.00");
      assert.equal(changed.TeoricoCalculado, "80.00");
      assert.equal(changed.CierreCoincide, false);
      assert.equal(changed.Diferencia, "-4.00");
      await pool.execute(
        "UPDATE CAJASALDO SET SaldoTeorico='80.00' WHERE IDTabla=?",
        [first],
      );
    },
  );
  await t.test(
    "precisión decimal y cierres incompletos sin presentar importes faltantes como cero",
    async () => {
      await pool.execute(
        "INSERT INTO CAJASALDO (Caja,AperturaEn,SaldoInicial,UsuarioApertura,Estado,CierreEn,SaldoTeorico,SaldoContado) VALUES ('CR_BIG','2026-10-27 13:00:00','90071992547409.91',?,'CERRADO','2026-10-27 22:00:00','90071992547410.00','90071992547409.99')",
        [admin.session.usuario.id],
      );
      const [ids] = await pool.query<RowDataPacket[]>(
        "SELECT IDTabla FROM CAJASALDO WHERE Caja='CR_BIG'",
      );
      await pool.execute(
        "INSERT INTO CAJAMOVIMIENTO (Comprobante,NumeroComprobante,Cliente,FechaOrigen,CajaSaldo,Concepto,ImporteEfectivo,ImporteTotal,Sentido,Estado,Usuario,CreadoEn) VALUES ('CR_TI',900000001,NULL,'2026-10-27',?,'CR_FUND','0.09','0.09','INGRESO','CONFIRMADO',?,?)",
        [ids[0]!.IDTabla, admin.session.usuario.id, new Date()],
      );
      const big = await report("Caja=CR_BIG");
      assert.equal(big.registros[0]!.TeoricoCalculado, "90071992547410.00");
      assert.equal(big.registros[0]!.Diferencia, "-0.01");
      assert.equal(big.registros[0]!.CierreCoincide, true);
      await pool.execute(
        "INSERT INTO CAJASALDO (Caja,AperturaEn,SaldoInicial,UsuarioApertura,Estado) VALUES ('CR_NULL','2026-10-27 13:00:00',0,?,'CERRADO')",
        [admin.session.usuario.id],
      );
      const incomplete = await report("Caja=CR_NULL");
      assert.equal(incomplete.registros[0]!.Teorico, null);
      assert.equal(incomplete.registros[0]!.SaldoContado, null);
      assert.equal(incomplete.registros[0]!.Diferencia, null);
      assert.equal(incomplete.totales.Diferencia, null);
      assert.equal((await report("Estado=CERRADO")).totales.Diferencia, null);
    },
  );
  await t.test(
    "orden global, totales del filtro y modo continuo sin truncamiento",
    async () => {
      for (let n = 0; n < 25; n++)
        await pool.execute(
          "INSERT INTO CAJASALDO (Caja,AperturaEn,SaldoInicial,UsuarioApertura,Estado,SaldoTeorico,SaldoContado) VALUES ('CR_MANY','2026-10-27 12:00:00',?,?,'CERRADO',?,?)",
          [String(n), admin.session.usuario.id, String(n), String(n)],
        );
      const all = await report(
        "Caja=CR_MANY&continuo=1&limite=1&pagina=2&orden=SaldoInicial&direccion=desc",
      );
      assert.equal(all.total, 25);
      assert.equal(all.registros.length, 25);
      assert.equal(all.registros[0]!.SaldoInicial, "24.00");
      assert.equal(all.registros.at(-1)!.SaldoInicial, "0.00");
      const paged = await report(
        "Caja=CR_MANY&limite=1&pagina=2&orden=SaldoInicial&direccion=desc",
      );
      assert.equal(paged.registros[0]!.SaldoInicial, "23.00");
      assert.deepEqual(paged.totales, all.totales);
    },
  );
  await t.test(
    "solo lectura: no modificar operaciones, cierres, numeración ni auditoría",
    async () => {
      const tables = [
        "CAJASALDO",
        "CAJAMOVIMIENTO",
        "CUENTACORRIENTE",
        "CAJAMOVIMIENTOAFECTACION",
        "TRANSFERENCIA",
        "CHEQUE",
        "CHEQUEEVENTO",
        "BANCOMOVIMIENTO",
        "NUMERACION",
        "AUDITORIA",
        "SOLICITUD",
      ];
      const snapshot = () =>
        Promise.all(
          tables.map(
            async (table) =>
              (
                await pool.query(
                  "SELECT * FROM " +
                    table +
                    " ORDER BY " +
                    (table === "NUMERACION" ? "Codigo" : "IDTabla"),
                )
              )[0],
          ),
        );
      const before = await snapshot();
      await report();
      await report("Desde=2026-10-27&Hasta=2026-10-28&continuo=1");
      await report("Caja=CR_MANY&limite=1");
      assert.deepEqual(await snapshot(), before);
    },
  );
});
