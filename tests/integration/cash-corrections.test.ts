import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  CashDetail,
  CashOptions,
  CurrentAccountList,
  PendingList,
  SessionResponse,
} from "@erp/shared";
import { createApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { effectiveBankMovement } from "../../apps/api/src/database/bank-movements.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createCurrentAccountStore } from "../../apps/api/src/current-account/store.js";

test("Caja: anulación de jornada, reversión histórica y trazabilidad sin campos nuevos", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_HOST, "127.0.0.1");
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  const password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador'),('AN_READ','Consulta')",
  );
  for (const role of ["ADMIN", "AN_READ"])
    await pool.execute(
      "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES (?,?,?,?,NOW())",
      [role, role + "-an@example.invalid", await hashPassword(password), role],
    );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('AN_T','Pruebas correcciones')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('AN_B','Banco correcciones')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('AN_BC','AN_B','Cuenta correcciones','ERP')",
  );
  for (const [code, account, nature, sense, module] of [
    ["AN_D", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["AN_PR", "PAGAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
    ["AN_C", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["AN_P", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["AN_RC", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
    ["AN_RP", "PAGAR", "DEUDA", "INGRESO", "COBROSPAGOS"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code, code, account, nature, sense, module],
    );
  await pool.query(
    "UPDATE COMPROBANTE SET EsReversion=1 WHERE Codigo IN ('AN_RC','AN_RP')",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='AN_RC' WHERE Codigo='AN_C'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='AN_RP' WHERE Codigo='AN_P'",
  );
  await pool.query(
    "INSERT INTO NUMERACION (Comprobante,ProximoNumero) VALUES ('AN_RC',100000001),('AN_RP',100000001)",
  );
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    cashMovement: createCashMovementStore(pool),
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
      body: JSON.stringify({ email: role + "-an@example.invalid", password }),
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      session: (await r.json()) as SessionResponse,
    };
  }
  const admin = await login("ADMIN"),
    reader = await login("AN_READ");
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    version?: string,
    key = randomUUID(),
    as = admin,
  ) {
    return fetch(base + path, {
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
  }
  async function good<T>(r: Response, status = 200): Promise<T> {
    assert.equal(r.status, status, await r.clone().text());
    return r.json() as Promise<T>;
  }
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  let sequence = 700000001n,
    index = 0;
  async function fixture(initial = "0.00") {
    const code = "AN_" + ++index;
    await pool.execute("INSERT INTO CAJA (Codigo,Nombre) VALUES (?,?)", [
      code,
      "Caja " + code,
    ]);
    await pool.execute(
      "INSERT INTO CLIENTE (Codigo,ClienteTipo,Nombre) VALUES (?,'AN_T',?)",
      [code, "Cliente " + code],
    );
    const box = await good<{ IDTabla: string }>(
      await req("caja-movimiento/cajas", "POST", {
        Caja: code,
        SaldoInicial: initial,
      }),
      201,
    );
    return { code, box: box.IDTabla, client: code };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const body = (f: Fixture, extra: Partial<CashInput> = {}): CashInput => ({
    Comprobante: "AN_C",
    NumeroComprobante: String(sequence++),
    Cliente: f.client,
    FechaOrigen: date,
    CajaSaldo: f.box,
    Concepto: null,
    ImporteEfectivo: "0.00",
    ImporteACuenta: "0.00",
    Observacion: null,
    Afectaciones: [],
    Valores: [],
    ...extra,
  });
  const create = async (f: Fixture, extra: Partial<CashInput>) =>
    good<CashDetail>(await req("caja-movimiento", "POST", body(f, extra)), 201);
  const get = async (id: string) =>
    good<CashDetail>(await req("caja-movimiento/" + id));
  async function debt(f: Fixture, amount: string, code = "AN_D") {
    const d = await good<{ registro: { IDTabla: string } }>(
      await req("cuenta-corriente", "POST", {
        Cliente: f.client,
        Comprobante: code,
        NumeroComprobante: String(sequence++),
        FechaOrigen: date,
        Vencimiento: null,
        Importe: amount,
        Observacion: null,
      }),
      201,
    );
    return d.registro.IDTabla;
  }
  const cancel = (
    d: CashDetail,
    f: Fixture,
    extra: Record<string, unknown> = {},
    key = randomUUID(),
  ) =>
    req(
      "caja-movimiento/" + d.registro.IDTabla + "/anular",
      "POST",
      {
        CajaSaldo: f.box,
        Motivo: "Corrección de prueba",
        ConfirmarCorreccionBancaria: false,
        ...extra,
      },
      d.version,
      key,
    );
  const reverse = (d: CashDetail, f: Fixture) =>
    req(
      "caja-movimiento/" + d.registro.IDTabla + "/revertir",
      "POST",
      {
        CajaSaldo: f.box,
        Motivo: "Corrección histórica",
      },
      d.version,
    );
  async function balance(f: Fixture) {
    const o = await good<CashOptions>(await req("caja-movimiento/opciones"));
    return o.aperturas.find((b) => b.IDTabla === f.box)!.SaldoActual;
  }
  const pending = async (f: Fixture, voucher = "AN_C") =>
    good<PendingList>(
      await req(
        "caja-movimiento/pendientes?" +
          new URLSearchParams({ Cliente: f.client, Comprobante: voucher }),
      ),
    );
  async function rows(sql: string, params: (string | number)[] = []) {
    return (await pool.execute<RowDataPacket[]>(sql, params))[0];
  }
  const third = (number: string, amount: string) => ({
    Tipo: "TERCERO" as const,
    Banco: "AN_B",
    BancoCuenta: null,
    CuentaLibradora: "12345",
    Numero: number,
    Librador: "Tercero",
    Documento: null,
    Emision: date,
    Vencimiento: date,
    Importe: amount,
  });
  const own = (number: string, amount: string) => ({
    ...third(number, amount),
    Tipo: "PROPIO" as const,
    BancoCuenta: "AN_BC",
    CuentaLibradora: null,
  });

  await t.test(
    "permisos, motivo, selección y versión se comprueban también en el servidor",
    async () => {
      const f = await fixture();
      const d = await create(f, {
        ImporteEfectivo: "10",
        ImporteACuenta: "10",
      });
      const path = "caja-movimiento/" + d.registro.IDTabla + "/anular";
      assert.equal((await fetch(base + path, { method: "POST" })).status, 401);
      assert.equal(
        (
          await req(
            path,
            "POST",
            { CajaSaldo: f.box, Motivo: "Prueba" },
            d.version,
            randomUUID(),
            reader,
          )
        ).status,
        403,
      );
      assert.equal(
        (await req(path, "POST", { CajaSaldo: f.box, Motivo: "Prueba" }))
          .status,
        400,
      );
      assert.equal((await cancel(d, f, { Motivo: "" })).status, 400);
      assert.equal((await cancel(d, f, { CajaSaldo: "" })).status, 400);
      assert.equal(
        (await cancel(d, f, { ConfirmarCorreccionBancaria: "true" })).status,
        400,
      );
      assert.equal(
        (
          await req(
            path,
            "POST",
            { CajaSaldo: f.box, Motivo: "Prueba" },
            "a".repeat(64),
          )
        ).status,
        409,
      );
      assert.equal(
        (await get(d.registro.IDTabla)).registro.Estado,
        "CONFIRMADO",
      );
    },
  );
  await t.test(
    "anular en la misma apertura libera deuda y anticipo, conserva número y afectaciones y admite reintento",
    async () => {
      const f = await fixture();
      const id = await debt(f, "100");
      const input = body(f, {
        ImporteEfectivo: "70",
        ImporteACuenta: "10",
        Afectaciones: [{ CuentaCorriente: id, Importe: "60" }],
      });
      const d = await good<CashDetail>(
        await req("caja-movimiento", "POST", input),
        201,
      );
      // Una apertura y un movimiento anteriores al día actual siguen siendo la misma jornada abierta.
      await pool.execute(
        "UPDATE CAJASALDO SET AperturaEn='2026-01-01 10:00:00' WHERE IDTabla=?",
        [f.box],
      );
      await pool.execute(
        "UPDATE CAJAMOVIMIENTO SET FechaOrigen='2026-01-01' WHERE IDTabla=?",
        [d.registro.IDTabla],
      );
      const original = await get(d.registro.IDTabla);
      assert.equal(original.registro.JornadaEstado, "ABIERTO");
      assert.equal((await pending(f)).registros[0]!.Pendiente, "40.00");
      const afBefore = await rows(
        "SELECT * FROM CAJAMOVIMIENTOAFECTACION WHERE CajaMovimiento=?",
        [d.registro.IDTabla],
      );
      const countBefore = await rows(
        "SELECT COUNT(*) AS total FROM CAJAMOVIMIENTO",
      );
      const key = randomUUID();
      const result = await good<CashDetail>(await cancel(original, f, {}, key));
      assert.equal(result.registro.Estado, "ANULADO");
      assert.equal(
        result.registro.NumeroComprobante,
        d.registro.NumeroComprobante,
      );
      assert.ok(result.registro.AnuladoEn);
      assert.equal(result.registro.AnuladoPor, "ADMIN");
      assert.equal(result.registro.RevertidoPor, null);
      assert.equal(await balance(f), "0.00");
      assert.equal((await pending(f)).registros[0]!.Pendiente, "100.00");
      const sums = await good<CurrentAccountList>(
        await req("cuenta-corriente?Cliente=" + f.client),
      );
      assert.equal(sums.saldos!.Cobrar, "100.00");
      assert.deepEqual(
        await rows(
          "SELECT * FROM CAJAMOVIMIENTOAFECTACION WHERE CajaMovimiento=?",
          [d.registro.IDTabla],
        ),
        afBefore,
      );
      assert.deepEqual(
        await rows("SELECT COUNT(*) AS total FROM CAJAMOVIMIENTO"),
        countBefore,
      );
      assert.equal(
        (
          await rows(
            "SELECT Estado FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
            [d.registro.IDTabla],
          )
        )[0]!.Estado,
        "ANULADO",
      );
      assert.equal(
        (await good<CashDetail>(await cancel(original, f, {}, key))).registro
          .IDTabla,
        d.registro.IDTabla,
      );
      assert.equal((await cancel(original, f)).status, 409);
      assert.equal((await req("caja-movimiento", "POST", input)).status, 409);
      const q = "&q=" + encodeURIComponent(d.registro.NumeroComprobanteTexto);
      const annulled = await good<{ registros: { IDTabla: string }[] }>(
        await req("caja-movimiento?Estado=ANULADO" + q),
      );
      assert.equal(annulled.registros[0]!.IDTabla, d.registro.IDTabla);
      assert.equal(
        (
          await good<{ total: number }>(
            await req("caja-movimiento?Estado=CONFIRMADO" + q),
          )
        ).total,
        0,
      );
    },
  );
  await t.test(
    "otra apertura abierta no permite corregir; la misma caja física reabierta requiere reversión y conserva el cierre",
    async () => {
      const f = await fixture();
      const d = await create(f, {
        ImporteEfectivo: "25",
        ImporteACuenta: "25",
      });
      const other = await fixture("100");
      assert.equal((await cancel(d, other)).status, 409);
      assert.equal((await reverse(d, other)).status, 409);
      assert.equal((await reverse(d, f)).status, 409);
      await good(
        await req("caja-movimiento/cajas/" + f.box + "/cerrar", "POST", {
          SaldoContado: "25",
          Observacion: null,
        }),
      );
      const closed = await rows("SELECT * FROM CAJASALDO WHERE IDTabla=?", [
        f.box,
      ]);
      const old = await rows("SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
        d.registro.IDTabla,
      ]);
      assert.equal((await reverse(d, f)).status, 409);
      const opened = await good<{ IDTabla: string }>(
        await req("caja-movimiento/cajas", "POST", {
          Caja: f.code,
          SaldoInicial: "100",
        }),
        201,
      );
      const current = { ...f, box: opened.IDTabla };
      assert.notEqual(current.box, f.box);
      assert.equal((await cancel(d, current)).status, 409);
      const reversal = await good<CashDetail>(await reverse(d, current));
      const original = await get(d.registro.IDTabla);
      assert.equal(original.registro.Estado, "REVERTIDO");
      assert.equal(reversal.registro.Estado, "CONFIRMADO");
      assert.equal(reversal.registro.CajaMovimientoOrigen, d.registro.IDTabla);
      assert.equal(
        original.relacionados.reversion!.IDTabla,
        reversal.registro.IDTabla,
      );
      assert.equal(reversal.relacionados.original!.IDTabla, d.registro.IDTabla);
      assert.equal(
        original.relacionados.reversion!.NumeroComprobanteTexto,
        reversal.registro.NumeroComprobanteTexto,
      );
      assert.equal(
        reversal.relacionados.original!.CajaNombre,
        d.registro.CajaNombre,
      );
      assert.deepEqual(
        await rows("SELECT * FROM CAJASALDO WHERE IDTabla=?", [f.box]),
        closed,
      );
      assert.deepEqual(
        await rows("SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
          d.registro.IDTabla,
        ]),
        old,
      );
      assert.equal((await cancel(reversal, current)).status, 409);
      assert.equal((await reverse(reversal, current)).status, 409);
      assert.equal(
        (await rows("SHOW COLUMNS FROM CAJAMOVIMIENTO LIKE 'Origen'")).length,
        0,
      );
      assert.equal(
        (
          await rows(
            "SHOW COLUMNS FROM CAJAMOVIMIENTO LIKE 'CajaMovimientoOrigen'",
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "anular un cobro no permite efectivo negativo; anular un pago devuelve su efecto a la misma apertura",
    async () => {
      const f = await fixture();
      const receipt = await create(f, {
        ImporteEfectivo: "100",
        ImporteACuenta: "100",
      });
      const payment = await create(f, {
        Comprobante: "AN_P",
        ImporteEfectivo: "80",
        ImporteACuenta: "80",
      });
      assert.equal(await balance(f), "20.00");
      const rejected = await cancel(receipt, f);
      assert.equal(rejected.status, 409);
      assert.match(await rejected.text(), /efectivo disponible/);
      assert.equal(
        (await get(receipt.registro.IDTabla)).registro.Estado,
        "CONFIRMADO",
      );
      await good(await cancel(payment, f));
      assert.equal(await balance(f), "100.00");
      await good(await cancel(receipt, f));
      assert.equal(await balance(f), "0.00");
    },
  );
  await t.test(
    "transferencias: confirmación registral obligatoria, vigencia bancaria derivada y registros íntegros",
    async () => {
      const f = await fixture();
      const id = await debt(f, "70", "AN_PR");
      const d = await create(f, {
        Comprobante: "AN_P",
        Afectaciones: [{ CuentaCorriente: id, Importe: "70" }],
        Valores: [
          {
            Tipo: "TRANSFERENCIA",
            BancoCuenta: "AN_BC",
            Importe: "70",
            Referencia: "Corrección registral",
          },
        ],
      });
      const transfers = await rows(
        "SELECT * FROM TRANSFERENCIA WHERE CajaMovimiento=?",
        [d.registro.IDTabla],
      );
      const bank = await rows(
        "SELECT bm.* FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia WHERE t.CajaMovimiento=?",
        [d.registro.IDTabla],
      );
      const active = async () =>
        rows(
          `SELECT bm.IDTabla FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia WHERE t.CajaMovimiento=? AND ${effectiveBankMovement}`,
          [d.registro.IDTabla],
        );
      assert.equal((await active()).length, 1);
      assert.equal((await cancel(d, f)).status, 400);
      const cancelled = await good<CashDetail>(
        await cancel(d, f, { ConfirmarCorreccionBancaria: true }),
      );
      assert.equal(cancelled.valores[0]!.Estado, "ANULADA");
      assert.equal((await active()).length, 0);
      assert.equal(await balance(f), "0.00");
      assert.deepEqual(
        await rows("SELECT * FROM TRANSFERENCIA WHERE CajaMovimiento=?", [
          d.registro.IDTabla,
        ]),
        transfers,
      );
      assert.deepEqual(
        await rows(
          "SELECT bm.* FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia WHERE t.CajaMovimiento=?",
          [d.registro.IDTabla],
        ),
        bank,
      );
      assert.equal((await pending(f, "AN_P")).registros[0]!.Pendiente, "70.00");
      const [a] = await rows(
        "SELECT Detalle FROM AUDITORIA WHERE Tabla='CAJAMOVIMIENTO' AND Registro=? AND Accion='ANULACION'",
        [d.registro.IDTabla],
      );
      const audit =
        typeof a!.Detalle === "string" ? JSON.parse(a!.Detalle) : a!.Detalle;
      assert.equal(audit.ConfirmarCorreccionBancaria, true);
      assert.equal(audit.BancoAntes[0].Vigente, true);
      assert.equal(audit.BancoDespues[0].Vigente, false);
    },
  );
  await t.test(
    "libro bancario: una reversión conserva vigentes el original y la contrapartida sin duplicar el saldo",
    async () => {
      const f = await fixture();
      const original = await create(f, {
        Comprobante: "AN_P",
        ImporteACuenta: "12",
        Valores: [
          {
            Tipo: "TRANSFERENCIA",
            BancoCuenta: "AN_BC",
            Importe: "12",
            Referencia: "Reversión histórica",
          },
        ],
      });
      await good(
        await req("caja-movimiento/cajas/" + f.box + "/cerrar", "POST", {
          SaldoContado: "0",
          Observacion: null,
        }),
      );
      const next = await good<{ IDTabla: string }>(
        await req("caja-movimiento/cajas", "POST", {
          Caja: f.code,
          SaldoInicial: "0",
        }),
        201,
      );
      const reversed = await good<CashDetail>(
        await reverse(original, { ...f, box: next.IDTabla }),
      );
      const ids = [original.registro.IDTabla, reversed.registro.IDTabla];
      const ledger = await rows(
        `SELECT bm.Sentido,bm.Importe FROM BANCOMOVIMIENTO bm JOIN TRANSFERENCIA t ON t.IDTabla=bm.Transferencia WHERE t.CajaMovimiento IN (?,?) AND ${effectiveBankMovement} ORDER BY bm.IDTabla`,
        ids,
      );
      assert.equal(ledger.length, 2);
      assert.deepEqual(
        ledger.map((r) => [r.Sentido, r.Importe]),
        [
          ["EGRESO", "12.00"],
          ["INGRESO", "12.00"],
        ],
      );
      assert.equal(
        (await get(original.registro.IDTabla)).registro.Estado,
        "REVERTIDO",
      );
      assert.equal(
        (
          await rows("SELECT Estado FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
            original.registro.IDTabla,
          ])
        )[0]!.Estado,
        "CONFIRMADO",
      );
    },
  );
  await t.test(
    "cheques: anular recepción/emisión y recuperar endoso conserva eventos, disponibilidad y una sola fila por valor",
    async () => {
      const f = await fixture();
      const received = await create(f, {
        ImporteACuenta: "30",
        Valores: [third("99101", "30")],
      });
      const annulled = await good<CashDetail>(await cancel(received, f));
      assert.equal(annulled.valores.length, 1);
      assert.equal(annulled.valores[0]!.Estado, "RECEPCION_ANULADA");
      assert.equal(
        (
          await rows(
            "SELECT Tipo FROM CHEQUEEVENTO WHERE Cheque=? ORDER BY IDTabla",
            [received.valores[0]!.IDTabla],
          )
        ).length,
        2,
      );
      assert.equal(
        (
          await req(
            "caja-movimiento",
            "POST",
            body(f, { ImporteACuenta: "30", Valores: [third("99101", "30")] }),
          )
        ).status,
        409,
      );
      const issued = await create(f, {
        Comprobante: "AN_P",
        ImporteACuenta: "20",
        Valores: [own("99102", "20")],
      });
      const cancelledOwn = await good<CashDetail>(await cancel(issued, f));
      assert.equal(cancelledOwn.valores.length, 1);
      assert.equal(cancelledOwn.valores[0]!.Estado, "ANULADO");
      const receipt = await create(f, {
        ImporteACuenta: "30",
        Valores: [third("99103", "30")],
      });
      const cheque = receipt.valores[0]!.IDTabla;
      const endorsement = await create(f, {
        Comprobante: "AN_P",
        ImporteACuenta: "30",
        Valores: [{ Tipo: "CARTERA", Cheque: cheque }],
      });
      assert.equal((await cancel(receipt, f)).status, 409);
      const restored = await good<CashDetail>(await cancel(endorsement, f));
      assert.equal(restored.valores.length, 1);
      assert.equal(restored.valores[0]!.Estado, "CARTERA");
      const portfolio = await good<{ registros: { IDTabla: string }[] }>(
        await req("caja-movimiento/cartera?q=99103"),
      );
      assert.equal(portfolio.registros[0]!.IDTabla, cheque);
      assert.equal(await balance(f), "0.00");
    },
  );
  await t.test(
    "una aplicación posterior del crédito bloquea su anulación",
    async () => {
      const f = await fixture();
      const original = await create(f, {
        ImporteACuenta: "20",
        Valores: [third("99104", "20")],
      });
      const other = await create(f, {
        ImporteEfectivo: "1",
        ImporteACuenta: "1",
      });
      const [credit] = await rows(
        "SELECT IDTabla FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
        [original.registro.IDTabla],
      );
      // Fixture de una aplicación posterior, reservada a una etapa futura del producto.
      await pool.execute(
        "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe) VALUES (?,?,1)",
        [other.registro.IDTabla, String(credit!.IDTabla)],
      );
      assert.equal((await cancel(original, f)).status, 409);
      assert.equal(
        (await get(original.registro.IDTabla)).registro.Estado,
        "CONFIRMADO",
      );
    },
  );
  await t.test(
    "un fallo de auditoría revierte estados, eventos e idempotencia de la anulación completa",
    async () => {
      const f = await fixture();
      const d = await create(f, {
        ImporteEfectivo: "5",
        ImporteACuenta: "15",
        Valores: [third("99105", "10")],
      });
      const before = await rows(
        "SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?",
        [d.registro.IDTabla],
      );
      const events = await rows(
        "SELECT * FROM CHEQUEEVENTO WHERE CajaMovimiento=?",
        [d.registro.IDTabla],
      );
      const key = randomUUID();
      await pool.query("RENAME TABLE AUDITORIA TO AUDITORIA_AN_TEST");
      try {
        assert.equal((await cancel(d, f, {}, key)).status, 500);
      } finally {
        await pool.query("RENAME TABLE AUDITORIA_AN_TEST TO AUDITORIA");
      }
      assert.deepEqual(
        await rows("SELECT * FROM CAJAMOVIMIENTO WHERE IDTabla=?", [
          d.registro.IDTabla,
        ]),
        before,
      );
      assert.deepEqual(
        await rows("SELECT * FROM CHEQUEEVENTO WHERE CajaMovimiento=?", [
          d.registro.IDTabla,
        ]),
        events,
      );
      assert.equal(
        (await get(d.registro.IDTabla)).valores[0]!.Estado,
        "CARTERA",
      );
      assert.equal(await balance(f), "5.00");
      await good(await cancel(d, f, {}, key));
      assert.equal(await balance(f), "0.00");
    },
  );
  await t.test(
    "anulaciones simultáneas y cierre concurrente no duplican correcciones ni alteran un cierre confirmado",
    async () => {
      const f = await fixture();
      const d = await create(f, { ImporteEfectivo: "5", ImporteACuenta: "5" });
      const attempts = await Promise.all([cancel(d, f), cancel(d, f)]);
      assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
      assert.equal(await balance(f), "0.00");
      const other = await fixture();
      const movement = await create(other, {
        ImporteEfectivo: "5",
        ImporteACuenta: "5",
      });
      const [annul, close] = await Promise.all([
        cancel(movement, other),
        req("caja-movimiento/cajas/" + other.box + "/cerrar", "POST", {
          SaldoContado: "5",
          Observacion: "Prueba de competencia con cierre",
        }),
      ]);
      assert.equal(close.status, 200, await close.clone().text());
      assert.ok([200, 409].includes(annul.status));
      const [closed] = await rows("SELECT * FROM CAJASALDO WHERE IDTabla=?", [
        other.box,
      ]);
      assert.equal(closed!.Estado, "CERRADO");
      assert.equal(
        closed!.SaldoTeorico,
        annul.status === 200 ? "0.00" : "5.00",
      );
      assert.equal((await cancel(movement, other)).status, 409);
    },
  );
  await t.test(
    "Reversión automática: configuración, Numerador obligatorio, campos protegidos y concurrencia",
    async () => {
      const oldBox = await fixture();
      const destination = await fixture();
      await pool.query(
        "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos) VALUES ('AN_X','Cobro automático','COBROSPAGOS','COBRAR','CREDITO','INGRESO')",
      );
      const originals = await Promise.all(
        [10, 20].map((amount) =>
          create(oldBox, {
            Comprobante: "AN_X",
            ImporteACuenta: String(amount),
            Valores: [
              {
                Tipo: "TRANSFERENCIA",
                BancoCuenta: "AN_BC",
                Importe: String(amount),
                Referencia: null,
              },
            ],
          }),
        ),
      );
      await good(
        await req("caja-movimiento/cajas/" + oldBox.box + "/cerrar", "POST", {
          SaldoContado: "0",
          Observacion: null,
        }),
      );
      const path = (d: CashDetail) => "caja-movimiento/" + d.registro.IDTabla;
      const input = {
        CajaSaldo: destination.box,
        Motivo: "Reversión automática de prueba",
      };
      const send = (
        d: CashDetail,
        extra: Record<string, unknown> = {},
        key = randomUUID(),
      ) =>
        req(
          path(d) + "/revertir",
          "POST",
          { ...input, ...extra },
          d.version,
          key,
        );
      const preview = () => req(path(originals[0]!) + "/reversion");
      assert.equal((await preview()).status, 409, "Exige asociación");
      assert.equal((await send(originals[0]!)).status, 409);
      await pool.query(
        "INSERT INTO COMPROBANTE (Codigo,Descripcion,ModuloOrigen,Cuenta,Naturaleza,SentidoFondos,EsReversion) VALUES ('AN_RX','Reversión automática','COBROSPAGOS','COBRAR','DEUDA','EGRESO',1)",
      );
      await pool.query(
        "UPDATE COMPROBANTE SET ComprobanteReversion='AN_RX' WHERE Codigo='AN_X'",
      );
      assert.equal((await preview()).status, 409, "Exige Numerador");
      assert.equal((await send(originals[0]!)).status, 409);
      await pool.query(
        "INSERT INTO NUMERACION (Comprobante,ProximoNumero,Activo) VALUES ('AN_RX',100000025,0)",
      );
      assert.equal((await preview()).status, 409);
      assert.equal((await send(originals[0]!)).status, 409);
      await pool.query(
        "UPDATE NUMERACION SET Activo=1 WHERE Comprobante='AN_RX'",
      );
      for (const change of ["EsReversion=0", "Activo=0", "Cuenta='PAGAR'"]) {
        await pool.query(
          "UPDATE COMPROBANTE SET " + change + " WHERE Codigo='AN_RX'",
        );
        assert.equal((await preview()).status, 409);
        assert.equal((await send(originals[0]!)).status, 409);
        await pool.query(
          "UPDATE COMPROBANTE SET EsReversion=1,Activo=1,Cuenta='COBRAR' WHERE Codigo='AN_RX'",
        );
      }
      const suggestion = await good<{
        Comprobante: string;
        NumeroComprobante: string;
      }>(await preview());
      assert.equal(suggestion.Comprobante, "AN_RX");
      assert.equal(suggestion.NumeroComprobante, "100000025");
      for (const extra of [
        { Comprobante: "AN_RC" },
        { NumeroComprobante: "999999999999" },
        { CajaSaldo: "" },
      ])
        assert.equal((await send(originals[0]!, extra)).status, 400);
      assert.equal(
        (await send(originals[0]!, { CajaSaldo: oldBox.box })).status,
        409,
      );
      assert.equal(
        String(
          (
            await rows(
              "SELECT ProximoNumero FROM NUMERACION WHERE Comprobante='AN_RX'",
            )
          )[0]!.ProximoNumero,
        ),
        "100000025",
        "Los errores y la vista previa no consumen números",
      );
      const options = await good<CashOptions>(
        await req("caja-movimiento/opciones"),
      );
      assert.ok(!options.comprobantes.some((v) => v.Codigo === "AN_RX"));
      assert.equal(
        (
          await req(
            "caja-movimiento",
            "POST",
            body(destination, {
              Comprobante: "AN_RX",
              ImporteACuenta: "1",
              ImporteEfectivo: "1",
            }),
          )
        ).status,
        400,
      );
      const key = randomUUID();
      const results = await Promise.all([
        send(originals[0]!, {}, key),
        send(originals[1]!),
      ]);
      const reversed = await Promise.all(
        results.map((result) => good<CashDetail>(result)),
      );
      assert.deepEqual(
        reversed.map((d) => d.registro.NumeroComprobante).sort(),
        ["100000025", "100000026"],
      );
      assert.ok(reversed.every((d) => d.registro.Comprobante === "AN_RX"));
      await pool.query(
        "UPDATE COMPROBANTE SET ComprobanteReversion=NULL WHERE Codigo='AN_X'",
      );
      const retry = await good<CashDetail>(await send(originals[0]!, {}, key));
      assert.equal(retry.registro.IDTabla, reversed[0]!.registro.IDTabla);
      assert.equal(
        String(
          (
            await rows(
              "SELECT ProximoNumero FROM NUMERACION WHERE Comprobante='AN_RX'",
            )
          )[0]!.ProximoNumero,
        ),
        "100000027",
      );
    },
  );
});
