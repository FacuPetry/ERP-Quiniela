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
        "Cliente=LG_A&Desde=2026-01-01",
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
    "anulación visible sin incidencia: conservar importe y aplicaciones sin contarlas",
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
      const cancelled = r.registros.find((v) =>
        v.Operacion?.startsWith("LG_P"),
      )!;
      assert.equal(cancelled.Estado, "ANULADO");
      assert.equal(cancelled.ImporteOriginal, "30.00");
      assert.equal(cancelled.Debito, "0.00");
      assert.equal(cancelled.Afectaciones[0]!.Vigente, false);
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
      assert.equal(r.total, 6);
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
      await list("ClienteTipo=LG_T");
      assert.deepEqual(await snapshot(), before);
    },
  );
});
