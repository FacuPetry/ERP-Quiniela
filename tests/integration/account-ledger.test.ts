import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  AccountLedger,
  AccountSummary,
  CashDetail,
  CurrentAccountDetail,
  SessionResponse,
  UserDetail,
} from "@erp/shared";
import type { RowDataPacket } from "mysql2/promise";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createReportStore } from "../../apps/api/src/reports/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createUserStore } from "../../apps/api/src/users/store.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";
test("Mayor de Cuenta corriente: secuencia, asociaciones informativas y saldo vigente", async (t) => {
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
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Administrador mayor','ledger-admin@example.invalid',?,'ADMIN',?)",
    [await hashPassword(password), new Date()],
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion,Activo) VALUES ('LG_T','Jugadores',1),('LG_T2','Tipo histórico',0)",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo,Activo) VALUES ('LG_A','Cliente A','LG_T',1),('LG_B','Cliente B','LG_T2',0),('LG_EMPTY','Sin movimientos','LG_T',1),('LG_ADV','Cliente con anticipo','LG_T',1)",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('LG_CAJA','Caja mayor')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('LG_BANCO','Banco mayor')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('LG_CUENTA','LG_BANCO','Cuenta mayor','ERP')",
  );
  for (const [code, account, nature, sense, module] of [
    ["LG_D", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["LG_CR", "COBRAR", "CREDITO", "NOAPLICA", "CUENTACORRIENTE"],
    ["LG_PR", "PAGAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["LG_C", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["LG_P", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["LG_RC", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, sense, module],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('LG_RC',100000001)",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET Numerador='LG_RC',EsReversion=1 WHERE Codigo='LG_RC'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='LG_RC' WHERE Codigo='LG_C'",
  );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    reports: createReportStore(pool),
    masters: createMasterStore(pool),
    users: createUserStore(pool),
    currentAccount: createCurrentAccountStore(pool),
    cashMovement: createCashMovementStore(pool),
    values: createValuesStore(pool),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });
  async function login(email: string) {
    const r = await fetch(base + "/api/auth/login", {
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
  const admin = await login("ledger-admin@example.invalid");
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    who = admin,
    version?: string,
  ) {
    return fetch(base + "/api" + path, {
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
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d as T;
  }
  let number = 300000001;
  let box: string,
    receipt: CashDetail,
    payment: CashDetail,
    d1: CurrentAccountDetail,
    d2: CurrentAccountDetail,
    prize: CurrentAccountDetail;
  async function debt(
    Comprobante: string,
    Importe: string,
    FechaOrigen: string,
    Cliente = "LG_A",
  ) {
    return json<CurrentAccountDetail>(
      await req("/cuenta-corriente", "POST", {
        Cliente,
        Comprobante,
        NumeroComprobante: String(number++),
        FechaOrigen,
        Vencimiento: FechaOrigen,
        Importe,
        Observacion: null,
      }),
      201,
    );
  }
  async function ledger(query = "Cliente=LG_A") {
    return json<AccountLedger>(
      await req("/informes/cuenta-corriente/resumen?" + query),
    );
  }
  async function list(query = "Cliente=LG_A") {
    return json<AccountSummary>(
      await req("/informes/cuenta-corriente?" + query),
    );
  }
  const cheque = (Numero: string, Importe: string) => ({
    Tipo: "TERCERO",
    Banco: "LG_BANCO",
    BancoCuenta: null,
    CuentaLibradora: "123",
    Numero,
    Librador: "Tercero",
    Documento: null,
    Emision: "2026-01-01",
    Vencimiento: "2026-01-03",
    Importe,
  });
  await t.test(
    "cliente obligatorio, permisos independientes y referencias sin habilitar otros módulos",
    async () => {
      assert.equal(
        (
          await fetch(
            base + "/api/informes/cuenta-corriente/resumen?Cliente=LG_A",
          )
        ).status,
        401,
      );
      for (const query of [
        "",
        "Cliente=",
        "Cliente=LG_A&orden=FechaOrigen&direccion=desc",
        "Cliente=LG_A&Desde=2026-02-30",
        "Cliente=LG_A&Desde=2026-02-02&Hasta=2026-01-01",
        "Cliente=LG_A&Hasta=texto",
        "Cliente=LG_A&continuo=2",
      ])
        assert.equal(
          (await req("/informes/cuenta-corriente/resumen?" + query)).status,
          400,
        );
      assert.equal(
        (await req("/informes/cuenta-corriente/resumen?Cliente=INEXISTENTE"))
          .status,
        404,
      );
      const userInput = {
        nombre: "Solo resumen",
        email: "ledger-reader@example.invalid",
        activo: true,
        password,
        permisos: [{ menu: "resumen-cuenta-corriente", escritura: false }],
      };
      await json<UserDetail>(await req("/usuarios", "POST", userInput), 201);
      const reader = await login(userInput.email);
      assert.equal(
        (
          await req(
            "/informes/cuenta-corriente/resumen?Cliente=LG_EMPTY",
            "GET",
            undefined,
            reader,
          )
        ).status,
        200,
      );
      for (const path of [
        "/informes/cuenta-corriente",
        "/cuenta-corriente",
        "/caja-movimiento",
        "/maestros/clientes",
      ])
        assert.equal((await req(path, "GET", undefined, reader)).status, 403);
      assert.equal(
        (await req("/referencias/clientes?q=LG_A", "GET", undefined, reader))
          .status,
        200,
      );
      assert.equal(
        (
          await req("/usuarios", "POST", {
            ...userInput,
            email: "ledger-write@example.invalid",
            permisos: [{ menu: "resumen-cuenta-corriente", escritura: true }],
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "cobro con dos afectaciones y tres medios: una sola fila monetaria",
    async () => {
      box = (
        await json<{ IDTabla: string }>(
          await req("/caja-movimiento/cajas", "POST", {
            Caja: "LG_CAJA",
            SaldoInicial: "100.00",
          }),
          201,
        )
      ).IDTabla;
      d1 = await debt("LG_D", "100.00", "2026-01-02");
      d2 = await debt("LG_D", "50.00", "2026-01-02");
      prize = await debt("LG_PR", "80.00", "2026-01-01");
      receipt = await json<CashDetail>(
        await req("/caja-movimiento", "POST", {
          Comprobante: "LG_C",
          NumeroComprobante: String(number++),
          Cliente: "LG_A",
          CajaSaldo: box,
          FechaOrigen: "2026-01-03",
          Concepto: null,
          ImporteEfectivo: "50.00",
          ImporteACuenta: "0.00",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: d1.registro.IDTabla, Importe: "100.00" },
            { CuentaCorriente: d2.registro.IDTabla, Importe: "50.00" },
          ],
          Valores: [
            {
              Tipo: "TRANSFERENCIA",
              BancoCuenta: "LG_CUENTA",
              Importe: "60.00",
              Referencia: "LG_TRANSFER",
            },
            cheque("900001", "40.00"),
          ],
        }),
        201,
      );
      payment = await json<CashDetail>(
        await req("/caja-movimiento", "POST", {
          Comprobante: "LG_P",
          NumeroComprobante: String(number++),
          Cliente: "LG_A",
          CajaSaldo: box,
          FechaOrigen: "2026-01-04",
          Concepto: null,
          ImporteEfectivo: "30.00",
          ImporteACuenta: "0.00",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: prize.registro.IDTabla, Importe: "30.00" },
          ],
          Valores: [],
        }),
        201,
      );
      const r = await ledger();
      assert.equal(r.total, 5);
      assert.deepEqual(
        r.registros.map((v) => v.SaldoAcumulado),
        ["-80.00", "20.00", "70.00", "-80.00", "-50.00"],
      );
      assert.deepEqual(r.totales, {
        Debito: "180.00",
        Credito: "230.00",
        SaldoFinal: "-50.00",
        SaldoCobrar: "0.00",
        SaldoPagar: "50.00",
      });
      const cash = r.registros.find((v) => v.Operacion?.startsWith("LG_C"))!;
      assert.equal(cash.Credito, "150.00");
      assert.equal(cash.Afectaciones.length, 2);
      assert.equal(cash.Valores.length, 2);
      const original = r.registros.find(
        (v) => v.Clave === d1.registro.IDTabla,
      )!;
      assert.equal(original.Afectaciones.length, 1);
      assert.equal(original.Valores.length, 2);
      assert.equal(new Set(r.registros.map((v) => v.Clave)).size, 5);
      assert.equal((await list()).totales.SaldoNeto, r.totales.SaldoFinal);
    },
  );
  await t.test(
    "ventana cronológica global y desempate estable antes de paginar",
    async () => {
      const first = await ledger("Cliente=LG_A&limite=2"),
        second = await ledger("Cliente=LG_A&limite=2&pagina=2");
      assert.deepEqual(
        first.registros.map((v) => v.Clave),
        [prize.registro.IDTabla, d1.registro.IDTabla],
      );
      assert.equal(second.registros[0]!.Clave, d2.registro.IDTabla);
      assert.equal(second.registros[0]!.SaldoAcumulado, "70.00");
      assert.deepEqual(second.totales, first.totales);
    },
  );
  await t.test(
    "rango inclusivo: saldo anterior separado, movimientos del período y cierre sin sumar posteriores",
    async () => {
      const r = await ledger(
        "Cliente=LG_A&Desde=2026-01-02&Hasta=2026-01-03&continuo=1",
      );
      assert.equal(r.registros.length, 3);
      assert.equal(r.saldoAnterior.Saldo, "-80.00");
      assert.equal(r.saldoAnterior.Debito, "0.00");
      assert.equal(r.saldoAnterior.Credito, "80.00");
      assert.deepEqual(
        r.registros.map((v) => v.SaldoAcumulado),
        ["20.00", "70.00", "-80.00"],
      );
      assert.equal(r.totales.Debito, "150.00");
      assert.equal(r.totales.Credito, "150.00");
      assert.equal(r.totales.SaldoFinal, "-80.00");
      assert.equal(r.totales.SaldoPagar, "80.00");
      assert.equal(r.totales.SaldoCobrar, "0.00");
      assert.deepEqual(r.saldoAVencer, {
        Debito: "30.00",
        Credito: "0.00",
        Saldo: "30.00",
        SaldoAcumulado: "-50.00",
      });
      const justPayment = await ledger(
        "Cliente=LG_A&Desde=2026-01-04&Hasta=2026-01-04",
      );
      assert.equal(justPayment.saldoAnterior.Saldo, "-80.00");
      assert.equal(justPayment.registros.length, 1);
      assert.equal(justPayment.totales.Debito, "30.00");
      assert.equal(justPayment.totales.SaldoFinal, "-50.00");
      const empty = await ledger(
        "Cliente=LG_A&Desde=2026-01-05&Hasta=2026-01-06",
      );
      assert.equal(empty.total, 0);
      assert.equal(empty.saldoAnterior.Saldo, "-50.00");
      assert.equal(empty.totales.SaldoFinal, "-50.00");
      assert.equal(empty.totales.Debito, "0.00");
      assert.equal(empty.totales.Credito, "0.00");
      const onlyUntil = await ledger("Cliente=LG_A&Hasta=2026-01-01");
      assert.equal(onlyUntil.saldoAnterior.Saldo, "0.00");
      assert.equal(onlyUntil.total, 1);
      assert.equal(onlyUntil.totales.SaldoFinal, "-80.00");
      const none = await ledger("Cliente=LG_A&Hasta=2025-12-31");
      assert.equal(none.total, 0);
      assert.equal(none.totales.SaldoFinal, "0.00");
      assert.equal(none.saldoAVencer.SaldoAcumulado, "-50.00");
      assert.equal(none.saldoAVencer.Debito, "180.00");
      assert.equal(none.saldoAVencer.Credito, "230.00");
      const page = await ledger(
        "Cliente=LG_A&Desde=2026-01-02&Hasta=2026-01-03&limite=1&pagina=2",
      );
      assert.equal(page.registros[0]!.SaldoAcumulado, "70.00");
      assert.deepEqual(page.totales, r.totales);
    },
  );
  await t.test(
    "anulados excluidos del detalle, saldos y relaciones informativas",
    async () => {
      await json(
        await req(
          "/caja-movimiento/" + payment.registro.IDTabla + "/anular",
          "POST",
          { CajaSaldo: box, Motivo: "Error de registración" },
          admin,
          payment.version,
        ),
      );
      const r = await ledger();
      assert.equal(r.total, 4);
      assert.ok(r.registros.every((v) => v.Estado !== "ANULADO"));
      assert.ok(r.registros.every((v) => !v.Operacion?.startsWith("LG_P")));
      assert.ok(
        r.registros.every((v) =>
          v.Afectaciones.every(
            (a) => a.CajaMovimiento !== payment.registro.IDTabla,
          ),
        ),
      );
      const originalPayment = await json<CashDetail>(
        await req("/caja-movimiento/" + payment.registro.IDTabla),
      );
      assert.equal(originalPayment.registro.Estado, "ANULADO");
      assert.equal(originalPayment.registro.ImporteTotal, "30.00");
      assert.equal(r.totales.SaldoFinal, "-80.00");
    },
  );
  await t.test(
    "reversión conserva el original y agrega contrapartida una vez, incluso con varios eventos de cheque",
    async () => {
      await json(
        await req("/caja-movimiento/cajas/" + box + "/cerrar", "POST", {
          SaldoContado: "150.00",
          Observacion: null,
        }),
      );
      box = (
        await json<{ IDTabla: string }>(
          await req("/caja-movimiento/cajas", "POST", {
            Caja: "LG_CAJA",
            SaldoInicial: "500.00",
          }),
          201,
        )
      ).IDTabla;
      const fresh = await json<CashDetail>(
        await req("/caja-movimiento/" + receipt.registro.IDTabla),
      );
      await json(
        await req(
          "/caja-movimiento/" + receipt.registro.IDTabla + "/revertir",
          "POST",
          { CajaSaldo: box, Motivo: "Devolución real" },
          admin,
          fresh.version,
        ),
      );
      const r = await ledger();
      assert.equal(r.total, 5);
      assert.equal(r.totales.SaldoFinal, "70.00");
      assert.equal(r.totales.SaldoFinal, (await list()).totales.SaldoNeto);
      const original = r.registros.find((v) =>
          v.Operacion?.startsWith("LG_C"),
        )!,
        reverse = r.registros.find((v) => v.EsReverso)!;
      assert.equal(original.Estado, "REVERTIDO");
      assert.equal(original.Credito, "150.00");
      assert.ok(original.Reversion);
      assert.equal(reverse.Debito, "150.00");
      assert.ok(reverse.Original);
      assert.equal(original.Valores.length, 2);
      assert.equal(reverse.Valores.length, 2);
      const period = await ledger(
        "Cliente=LG_A&Desde=2026-01-03&Hasta=2026-01-03&continuo=1",
      );
      assert.equal(period.saldoAnterior.Saldo, "70.00");
      assert.equal(period.totales.SaldoFinal, "-80.00");
      assert.equal(period.saldoAVencer.Debito, "150.00");
      assert.equal(period.saldoAVencer.Credito, "0.00");
      assert.equal(period.saldoAVencer.SaldoAcumulado, "70.00");
      assert.equal(period.registros.length, 1);
      const reversePeriod = await ledger(
        "Cliente=LG_A&Desde=" +
          reverse.FechaOrigen +
          "&Hasta=" +
          reverse.FechaOrigen,
      );
      assert.equal(reversePeriod.saldoAnterior.Saldo, "-80.00");
      assert.equal(reversePeriod.totales.Debito, "150.00");
      assert.equal(reversePeriod.totales.SaldoFinal, "70.00");
      assert.equal(reversePeriod.saldoAVencer.Saldo, "0.00");
    },
  );
  await t.test(
    "anticipo y crédito independiente reducen el neto una sola vez",
    async () => {
      const d = await debt("LG_D", "80.00", "2026-01-01", "LG_ADV");
      await json<CashDetail>(
        await req("/caja-movimiento", "POST", {
          Comprobante: "LG_C",
          NumeroComprobante: String(number++),
          Cliente: "LG_ADV",
          CajaSaldo: box,
          FechaOrigen: "2026-01-02",
          Concepto: null,
          ImporteEfectivo: "100.00",
          ImporteACuenta: "20.00",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: d.registro.IDTabla, Importe: "80.00" },
          ],
          Valores: [],
        }),
        201,
      );
      await debt("LG_CR", "5.00", "2026-01-03", "LG_ADV");
      const r = await ledger("Cliente=LG_ADV");
      assert.equal(r.total, 3);
      assert.deepEqual(
        r.registros.map((v) => v.SaldoAcumulado),
        ["80.00", "-20.00", "-25.00"],
      );
      assert.equal(r.totales.Debito, "80.00");
      assert.equal(r.totales.Credito, "105.00");
      assert.equal(
        r.totales.SaldoFinal,
        (await list("Cliente=LG_ADV")).totales.SaldoNeto,
      );
    },
  );
  await t.test(
    "precisión y números heredados NULL; listado por tipo incluso inactivo y filtros combinados",
    async () => {
      // Alta temporal activa para utilizar el mismo flujo que la aplicación.
      await pool.query("UPDATE CLIENTE SET Activo=1 WHERE Codigo='LG_B'");
      await debt("LG_D", "90071992547409.91", "2026-01-01", "LG_B");
      await pool.execute(
        "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('LG_B','LG_D','2026-01-02','COBRAR','DEUDA','0.09','CONFIRMADO',?,?)",
        [admin.session.usuario.id, new Date()],
      );
      await pool.query("UPDATE CLIENTE SET Activo=0 WHERE Codigo='LG_B'");
      const b = await ledger("Cliente=LG_B");
      assert.equal(b.totales.SaldoFinal, "90071992547410.00");
      assert.equal(b.registros[1]!.SaldoAcumulado, "90071992547410.00");
      const period = await ledger(
        "Cliente=LG_B&Desde=2026-01-02&Hasta=2026-01-02",
      );
      assert.equal(period.saldoAnterior.Debito, "90071992547409.91");
      assert.equal(period.totales.Debito, "0.09");
      assert.equal(period.totales.SaldoFinal, "90071992547410.00");
      assert.equal(period.saldoAVencer.SaldoAcumulado, "90071992547410.00");
      const listing = await list("ClienteTipo=LG_T2");
      assert.equal(listing.total, 1);
      assert.equal(listing.registros[0]!.Cliente, "LG_B");
      assert.equal((await list("ClienteTipo=LG_T2&Cliente=LG_A")).total, 0);
      const types = await json<{
        registros: { Codigo: string; Activo: boolean }[];
      }>(await req("/referencias/tipos-cliente?estado=todos"));
      assert.ok(types.registros.some((v) => v.Codigo === "LG_T2" && !v.Activo));
      const empty = await ledger("Cliente=LG_EMPTY");
      assert.equal(empty.total, 0);
      assert.equal(Number(empty.totales.SaldoFinal), 0);
    },
  );
  await t.test(
    "rechazo: nueva deuda y operación original identificables sin repetir el crédito del Recibo",
    async () => {
      await pool.query("UPDATE CLIENTE SET Activo=1 WHERE Codigo='LG_B'");
      const d = await debt("LG_D", "60.00", "2026-01-02", "LG_B");
      const cash = await json<CashDetail>(
        await req("/caja-movimiento", "POST", {
          Comprobante: "LG_C",
          NumeroComprobante: String(number++),
          Cliente: "LG_B",
          CajaSaldo: box,
          FechaOrigen: "2026-01-03",
          Concepto: null,
          ImporteEfectivo: "0.00",
          ImporteACuenta: "0.00",
          Observacion: null,
          Afectaciones: [
            { CuentaCorriente: d.registro.IDTabla, Importe: "60.00" },
          ],
          Valores: [cheque("900002", "60.00")],
        }),
        201,
      );
      const id = cash.valores[0]!.IDTabla;
      await json(
        await req("/valores/depositos", "POST", {
          Cheques: [id],
          BancoCuenta: "LG_CUENTA",
          Fecha: "2026-01-04",
          Observacion: null,
        }),
      );
      const preview = await json<{ version: string }>(
        await req("/valores/CHEQUE/" + id + "/rechazo"),
      );
      await json(
        await req(
          "/valores/CHEQUE/" + id + "/rechazar",
          "POST",
          {
            Comprobante: "LG_D",
            NumeroComprobante: String(number++),
            Fecha: "2026-01-05",
            Motivo: "Cheque rechazado",
            ConfirmarDebitoBancario: false,
            FechaDebito: null,
          },
          admin,
          preview.version,
        ),
      );
      const r = await ledger("Cliente=LG_B");
      assert.equal(r.totales.SaldoFinal, "90071992547470.00");
      assert.equal(
        r.totales.SaldoFinal,
        (await list("Cliente=LG_B")).totales.SaldoNeto,
      );
      const rejection = r.registros.find((v) =>
        v.Detalle.includes("Rechazo de cheque"),
      )!;
      assert.equal(rejection.Debito, "60.00");
      assert.ok(rejection.Operacion?.startsWith("LG_C"));
      assert.equal(rejection.Valores.length, 1);
      assert.equal(rejection.Valores[0]!.Estado, "RECHAZADO");
    },
  );
  await t.test(
    "saldo anterior y a vencer: agrupar por origen, excluir anulados y no duplicar en totales del período",
    async () => {
      await pool.query(
        "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('LG_RANGE','Rango de fechas','LG_T')",
      );
      const before = await debt("LG_D", "100.00", "2026-01-01", "LG_RANGE");
      await pool.execute(
        "UPDATE CUENTACORRIENTE SET Vencimiento='2026-12-31' WHERE IDTabla=?",
        [before.registro.IDTabla],
      );
      await debt("LG_D", "20.00", "2026-01-03", "LG_RANGE");
      await debt("LG_CR", "5.00", "2026-01-04", "LG_RANGE");
      await debt("LG_D", "40.00", "2026-01-05", "LG_RANGE");
      await debt("LG_CR", "10.00", "2026-01-06", "LG_RANGE");
      for (const date of ["2026-01-01", "2026-01-03", "2026-01-07"]) {
        const cancelled = await debt("LG_D", "900.00", date, "LG_RANGE");
        await json(
          await req(
            "/cuenta-corriente/" + cancelled.registro.IDTabla + "/anular",
            "POST",
            { Motivo: "Sin efecto para informes" },
            admin,
            cancelled.version,
          ),
        );
      }
      const r = await ledger(
        "Cliente=LG_RANGE&Desde=2026-01-03&Hasta=2026-01-04&continuo=1",
      );
      assert.equal(r.total, 2);
      assert.deepEqual(r.saldoAnterior, {
        Debito: "100.00",
        Credito: "0.00",
        Saldo: "100.00",
        SaldoCobrar: "100.00",
        SaldoPagar: "0.00",
      });
      assert.deepEqual(
        r.registros.map((v) => v.SaldoAcumulado),
        ["120.00", "115.00"],
      );
      assert.equal(r.totales.Debito, "20.00");
      assert.equal(r.totales.Credito, "5.00");
      assert.equal(r.totales.SaldoFinal, "115.00");
      assert.deepEqual(r.saldoAVencer, {
        Debito: "40.00",
        Credito: "10.00",
        Saldo: "30.00",
        SaldoAcumulado: "145.00",
      });
      assert.equal(
        (await list("Cliente=LG_RANGE")).totales.SaldoNeto,
        r.saldoAVencer.SaldoAcumulado,
      );
      const openFrom = await ledger("Cliente=LG_RANGE&Desde=2026-01-03");
      assert.equal(openFrom.totales.SaldoFinal, "145.00");
      assert.equal(openFrom.saldoAVencer.Saldo, "0.00");
      const noMovements = await ledger(
        "Cliente=LG_RANGE&Desde=2026-01-02&Hasta=2026-01-02",
      );
      assert.equal(noMovements.total, 0);
      assert.equal(noMovements.saldoAnterior.Saldo, "100.00");
      assert.equal(noMovements.totales.SaldoFinal, "100.00");
      assert.equal(noMovements.saldoAVencer.SaldoAcumulado, "145.00");
    },
  );
  await t.test(
    "cierre negativo independiente del acumulado posterior: caso informado de 649990 y 674990",
    async () => {
      await pool.query(
        "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('LG_CLOSE','Verificación del cierre','LG_T')",
      );
      await debt("LG_D", "1100010.00", "2026-10-27", "LG_CLOSE");
      await debt("LG_CR", "500000.00", "2026-10-27", "LG_CLOSE");
      await debt("LG_PR", "1500000.00", "2026-10-27", "LG_CLOSE");
      for (const [voucher, amount] of [
        ["LG_CR", "100000.00"],
        ["LG_P", "100000.00"],
        ["LG_P", "400000.00"],
        ["LG_D", "500000.00"],
        ["LG_CR", "500000.00"],
        ["LG_CR", "150000.00"],
      ]) {
        // Asientos aislados para reproducir los importes; los circuitos reales
        // de cobro/pago/reversión y sus relaciones se prueban arriba.
        await pool.execute(
          "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) SELECT 'LG_CLOSE',Codigo,'2026-10-28',Cuenta,Naturaleza,?,'CONFIRMADO',?,? FROM COMPROBANTE WHERE Codigo=?",
          [amount, admin.session.usuario.id, new Date(), voucher],
        );
      }
      await debt("LG_D", "25000.00", "2026-10-30", "LG_CLOSE");
      await debt("LG_CR", "50000.00", "2026-10-30", "LG_CLOSE");
      const r = await ledger(
        "Cliente=LG_CLOSE&Desde=2026-10-28&Hasta=2026-10-29&continuo=1",
      );
      assert.equal(r.total, 6);
      assert.equal(r.saldoAnterior.Saldo, "-899990.00");
      assert.deepEqual(r.totales, {
        Debito: "1000000.00",
        Credito: "750000.00",
        SaldoFinal: "-649990.00",
        SaldoCobrar: "350010.00",
        SaldoPagar: "1000000.00",
      });
      assert.deepEqual(r.saldoAVencer, {
        Debito: "25000.00",
        Credito: "50000.00",
        Saldo: "-25000.00",
        SaldoAcumulado: "-674990.00",
      });
      assert.equal(r.registros.at(-1)!.SaldoAcumulado, r.totales.SaldoFinal);
      assert.equal(
        (await list("Cliente=LG_CLOSE")).totales.SaldoNeto,
        r.saldoAVencer.SaldoAcumulado,
      );
    },
  );
  await t.test(
    "modo continuo sin truncar por limite/pagina y sin alterar orden ni precisión",
    async () => {
      await pool.query(
        "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('LG_MANY','Muchos movimientos','LG_T')",
      );
      for (let start = 0; start < 225; start++)
        await pool.execute(
          "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES ('LG_MANY','LG_D','2026-02-01','COBRAR','DEUDA','0.01','CONFIRMADO',?,?)",
          [admin.session.usuario.id, new Date()],
        );
      const r = await ledger("Cliente=LG_MANY&continuo=1&limite=1&pagina=2");
      assert.equal(r.total, 225);
      assert.equal(r.registros.length, 225);
      assert.equal(r.registros[0]!.SaldoAcumulado, "0.01");
      assert.equal(r.registros.at(-1)!.SaldoAcumulado, "2.25");
      assert.equal(r.totales.SaldoFinal, "2.25");
      assert.equal(new Set(r.registros.map((v) => v.Clave)).size, 225);
      for (let n = 0; n < 105; n++) {
        const code = "LG_BATCH" + n.toString().padStart(3, "0");
        await pool.execute(
          "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES (?,?,'LG_T')",
          [code, "Cliente " + n],
        );
        await pool.execute(
          "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Estado,Usuario,CreadoEn) VALUES (?,'LG_D','2026-02-01','COBRAR','DEUDA','0.01','CONFIRMADO',?,?)",
          [code, admin.session.usuario.id, new Date()],
        );
      }
      const all = await list("ClienteTipo=LG_T&continuo=1&limite=1&pagina=2");
      assert.equal(all.registros.length, all.total);
      assert.ok(all.total > 100);
      const sorted = await list(
        "ClienteTipo=LG_T&continuo=1&orden=SaldoNeto&direccion=desc",
      );
      assert.equal(sorted.registros.length, all.total);
      assert.equal(sorted.registros[0]!.Cliente, "LG_RANGE");
      assert.equal(
        (await list("ClienteTipo=LG_T&limite=1")).registros.length,
        1,
      );
    },
  );
  await t.test(
    "consultas sin escrituras sobre importes, estados, eventos, cierres, numeración ni auditoría",
    async () => {
      const tables = [
        "CUENTACORRIENTE",
        "CAJAMOVIMIENTO",
        "CAJAMOVIMIENTOAFECTACION",
        "CAJASALDO",
        "CHEQUE",
        "CHEQUEEVENTO",
        "TRANSFERENCIA",
        "BANCOMOVIMIENTO",
        "NUMERACION",
        "AUDITORIA",
        "SOLICITUD",
      ];
      async function snapshot() {
        return Promise.all(
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
      }
      const before = await snapshot();
      await ledger();
      await ledger("Cliente=LG_B&limite=2&pagina=2");
      await ledger("Cliente=LG_A&Desde=2026-01-02&Hasta=2026-01-03&continuo=1");
      await ledger("Cliente=LG_MANY&continuo=1");
      await list("ClienteTipo=LG_T");
      assert.deepEqual(await snapshot(), before);
    },
  );
});
