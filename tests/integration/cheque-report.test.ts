import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CashInput,
  SessionResponse,
  ThirdPartyChequeReport,
  ThirdPartyChequeRow,
  UserDetail,
} from "@erp/shared";
import { createDatabase } from "../../apps/api/src/database/client.js";
import { readConfig } from "../../apps/api/src/config/env.js";
import { applyMigrations } from "../../apps/api/src/database/migrate.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { createAuthService } from "../../apps/api/src/auth/service.js";
import { createAuthStore } from "../../apps/api/src/auth/store.js";
import { createApp } from "../../apps/api/src/app.js";
import { createCashMovementStore } from "../../apps/api/src/cash-movement/store.js";
import { createValuesStore } from "../../apps/api/src/values/store.js";
import { createReportStore } from "../../apps/api/src/reports/store.js";
import { createMasterStore } from "../../apps/api/src/masters/store.js";
import { createUserStore } from "../../apps/api/src/users/store.js";

test("Informe de terceros: instrumentos únicos, estados vigentes y totales exactos", async (t) => {
  assert.equal(process.env.TEST_DATABASE_ISOLATED, "1");
  const config = readConfig();
  assert.equal(config.DB_NAME, "erp_quiniela_test");
  assert.equal(config.DB_HOST, "127.0.0.1");
  await applyMigrations(config);
  const { pool } = createDatabase(config);
  t.after(() => pool.end());
  const rows = async (sql: string, params: (string | number)[] = []) =>
    (await pool.execute<RowDataPacket[]>(sql, params))[0];
  const password = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT IGNORE INTO ROL (Codigo,Nombre) VALUES ('ADMIN','Administrador')",
  );
  await pool.execute(
    "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,CreadoEn) VALUES ('Admin informe cheques','qr-admin@example.invalid',?,'ADMIN',?)",
    [await hashPassword(password), new Date()],
  );
  const user = String(
    (
      await rows(
        "SELECT IDTabla FROM USUARIO WHERE Email='qr-admin@example.invalid'",
      )
    )[0]!.IDTabla,
  );
  await pool.query(
    "INSERT INTO CLIENTETIPO (Codigo,Descripcion) VALUES ('QR_T','Tipo informe cheques')",
  );
  await pool.query(
    "INSERT INTO CLIENTE (Codigo,Nombre,ClienteTipo) VALUES ('QR_C','Cliente QR_%literal','QR_T'),('QR_C2','Otro cliente QR','QR_T')",
  );
  await pool.query(
    "INSERT INTO CAJA (Codigo,Nombre) VALUES ('QR_BOX','Caja informe cheques')",
  );
  await pool.query(
    "INSERT INTO BANCO (Codigo,Nombre) VALUES ('QR_B','Banco librador QR'),('QR_B2','Banco destino QR')",
  );
  await pool.query(
    "INSERT INTO BANCOCUENTA (Codigo,Banco,Nombre,Titular) VALUES ('QR_ACC','QR_B2','Cuenta QR','ERP')",
  );
  for (const [code, account, nature, sense, module] of [
    ["QR_IN", "COBRAR", "CREDITO", "INGRESO", "COBROSPAGOS"],
    ["QR_OUT", "PAGAR", "CREDITO", "EGRESO", "COBROSPAGOS"],
    ["QR_REV", "COBRAR", "DEUDA", "EGRESO", "COBROSPAGOS"],
    ["QR_RECH", "COBRAR", "DEUDA", "NOAPLICA", "CUENTACORRIENTE"],
  ])
    await pool.execute(
      "INSERT INTO COMPROBANTE (Codigo,Descripcion,Cuenta,Naturaleza,SentidoFondos,ModuloOrigen) VALUES (?,?,?,?,?,?)",
      [code!, code!, account!, nature!, sense!, module!],
    );
  await pool.query(
    "INSERT INTO NUMERACION (Codigo,ProximoNumero) VALUES ('QR_N',900000100)",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET EsReversion=1,Numerador='QR_N' WHERE Codigo='QR_REV'",
  );
  await pool.query(
    "UPDATE COMPROBANTE SET ComprobanteReversion='QR_REV' WHERE Codigo='QR_IN'",
  );
  // La anulación fecha RECUPERACION con el día del negocio; los eventos
  // posteriores de esta prueba deben respetar también esa fecha real.
  const operationDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const cash = createCashMovementStore(pool),
    values = createValuesStore(pool);
  const opening = await cash.open(
    { Caja: "QR_BOX", SaldoInicial: "0.00" },
    user,
    randomUUID(),
  );
  let num = 900000001n;
  const input = (
    amount: string,
    Valores: CashInput["Valores"],
    pay = false,
  ): CashInput => ({
    Comprobante: pay ? "QR_OUT" : "QR_IN",
    NumeroComprobante: String(num++),
    NumeroAutomatico: false,
    Cliente: "QR_C",
    CajaSaldo: opening.IDTabla,
    FechaOrigen: "2026-10-20",
    Concepto: null,
    ImporteEfectivo: "0.00",
    ImporteACuenta: amount,
    Observacion: null,
    Afectaciones: [],
    Valores,
  });
  const receive = async (number: string, amount: string, own = false) => {
    const movement = await cash.create(
      input(
        amount,
        [
          {
            Tipo: own ? "PROPIO" : "TERCERO",
            Banco: own ? "QR_B2" : "QR_B",
            BancoCuenta: own ? "QR_ACC" : null,
            Numero: number,
            CuentaLibradora: own ? null : "QR001",
            Librador: "Librador QR",
            Documento: null,
            Emision: "2026-10-19",
            Vencimiento: "2026-11-10",
            Importe: amount,
          },
        ],
        own,
      ),
      user,
      randomUUID(),
    );
    return { id: movement.valores[0]!.IDTabla, movement };
  };
  const portfolio = await receive("2", "10.01"),
    endorsed = await receive("10", "20.02"),
    credited = await receive("30", "30.03"),
    rejected = await receive("40", "40.04"),
    recovered = await receive("50", "50.05"),
    cancelled = await receive("60", "60.06"),
    deposited = await receive("70", "70.07"),
    returned = await receive("80", "80.08"),
    own = await receive("90", "90.09", true);
  const pay = async (id: string, amount: string) =>
    cash.create(
      input(amount, [{ Tipo: "CARTERA", Cheque: id }], true),
      user,
      randomUUID(),
    );
  await pay(endorsed.id, "20.02");
  const oldPayment = await pay(recovered.id, "50.05");
  await cash.annul(
    oldPayment.registro.IDTabla,
    {
      CajaSaldo: opening.IDTabla,
      Motivo: "Corregir uso del cheque",
      ConfirmarCorreccionBancaria: false,
    },
    oldPayment.version,
    user,
    randomUUID(),
  );
  await cash.annul(
    cancelled.movement.registro.IDTabla,
    {
      CajaSaldo: opening.IDTabla,
      Motivo: "Recepción incorrecta",
      ConfirmarCorreccionBancaria: false,
    },
    cancelled.movement.version,
    user,
    randomUUID(),
  );
  await values.deposit(
    {
      Cheques: [credited.id, rejected.id, recovered.id, deposited.id],
      BancoCuenta: "QR_ACC",
      Fecha: operationDate,
      Observacion: null,
    },
    user,
    randomUUID(),
  );
  await values.accredit(
    {
      Cheques: [credited.id, recovered.id],
      Fecha: operationDate,
      Observacion: null,
    },
    user,
    randomUUID(),
  );
  await values.reject(
    rejected.id,
    {
      Comprobante: "QR_RECH",
      NumeroComprobante: "900000099",
      NumeroAutomatico: false,
      Fecha: operationDate,
      Motivo: "Sin fondos",
      ConfirmarDebitoBancario: false,
      FechaDebito: null,
    },
    (await values.rejectionPreview(rejected.id)).version,
    user,
    randomUUID(),
  );
  await cash.close(
    opening.IDTabla,
    { SaldoContado: "0.00", Observacion: null },
    user,
    randomUUID(),
  );
  const next = await cash.open(
    { Caja: "QR_BOX", SaldoInicial: "0.00" },
    user,
    randomUUID(),
  );
  await cash.reverse(
    returned.movement.registro.IDTabla,
    { CajaSaldo: next.IDTabla, Motivo: "Devolución del cheque recibido" },
    returned.movement.version,
    user,
    randomUUID(),
  );
  await cash.close(
    next.IDTabla,
    { SaldoContado: "0.00", Observacion: null },
    user,
    randomUUID(),
  );
  // Los maestros históricos inactivos siguen siendo consultables.
  await pool.query(
    "UPDATE BANCO SET Activo=0 WHERE Codigo IN ('QR_B','QR_B2')",
  );
  await pool.query("UPDATE CLIENTE SET Activo=0 WHERE Codigo='QR_C'");
  const server = createApp({
    checkDatabase: async () => {},
    auth: createAuthService(createAuthStore(pool)),
    reports: createReportStore(pool),
    users: createUserStore(pool),
    masters: createMasterStore(pool),
    values,
    cashMovement: cash,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port + "/api";
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
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
  const admin = await login("qr-admin@example.invalid");
  const req = (path: string, who = admin, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: who.cookie,
        "Content-Type": "application/json",
        "X-ERP-Request": "1",
        "X-CSRF-Token": who.session.csrfToken,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function json<T>(r: Response, status = 200) {
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d as T;
  }
  const report = async (q = "") =>
    json<ThirdPartyChequeReport>(
      await req(
        "/informes/cheques/terceros?Banco=QR_B&continuo=1" + (q ? "&" + q : ""),
      ),
    );
  const detail = async (id: string) =>
    json<ThirdPartyChequeRow>(await req("/informes/cheques/terceros/" + id));
  await t.test(
    "un cheque por instrumento pese a eventos y operaciones; terceros, estados y anulados",
    async () => {
      const d = await report();
      assert.equal(d.total, 7);
      assert.equal(new Set(d.registros.map((r) => r.Clave)).size, 7);
      assert.ok(
        !d.registros.some((r) => [own.id, cancelled.id].includes(r.Clave)),
      );
      assert.equal(
        d.registros.find((r) => r.Clave === portfolio.id)!.Estado,
        "CARTERA",
      );
      assert.equal(
        d.registros.find((r) => r.Clave === endorsed.id)!.Estado,
        "ENDOSADO",
      );
      assert.equal(
        d.registros.find((r) => r.Clave === returned.id)!.Estado,
        "DEVUELTO",
      );
      assert.deepEqual(d.totales, { Cantidad: 7, Importe: "300.30" });
      assert.deepEqual(
        d.subtotales.find((s) => s.Estado === "ACREDITADO"),
        { Estado: "ACREDITADO", Cantidad: 2, Importe: "80.08" },
      );
      assert.equal(
        d.registros.find((r) => r.Clave === credited.id)!.CuentaNombre,
        "Cuenta QR",
      );
      assert.equal(
        d.registros.find((r) => r.Clave === credited.id)!.BancoNombre,
        "Banco librador QR",
      );
    },
  );
  await t.test(
    "fechas civiles inclusivas por emisión/vencimiento, cliente, estado y búsqueda literal",
    async () => {
      assert.equal(
        (await report("Desde=2026-11-10&Hasta=2026-11-10")).total,
        7,
      );
      assert.equal(
        (await report("FechaPor=EMISION&Desde=2026-10-19&Hasta=2026-10-19"))
          .total,
        7,
      );
      assert.equal(
        (await report("Desde=2026-10-19&Hasta=2026-10-19")).total,
        0,
      );
      assert.equal((await report("Cliente=QR_C&Estado=CARTERA")).total, 1);
      assert.equal((await report("Cliente=QR_C2")).total, 0);
      assert.equal(
        (await report("q=" + encodeURIComponent("QR_%literal"))).total,
        7,
      );
      assert.equal(
        (await report("q=" + encodeURIComponent("NO_%literal"))).total,
        0,
      );
      assert.equal(
        (await report("Estado=DEPOSITADO")).registros[0]!.Clave,
        deposited.id,
      );
    },
  );
  await t.test(
    "totales completos en paginación y continuo; orden estable sin separar grupos",
    async () => {
      const full = await report();
      const a = await json<ThirdPartyChequeReport>(
        await req("/informes/cheques/terceros?Banco=QR_B&limite=2&pagina=1"),
      );
      const b = await json<ThirdPartyChequeReport>(
        await req("/informes/cheques/terceros?Banco=QR_B&limite=2&pagina=2"),
      );
      assert.equal(a.registros.length, 2);
      assert.equal(a.total, 7);
      assert.deepEqual(a.totales, full.totales);
      assert.deepEqual(a.subtotales, full.subtotales);
      assert.deepEqual(b.subtotales, full.subtotales);
      const sorted = await report("orden=Importe&direccion=desc");
      assert.deepEqual(
        sorted.registros
          .filter((r) => r.Estado === "ACREDITADO")
          .map((r) => r.Importe),
        ["50.05", "30.03"],
      );
      const states = sorted.registros.map((r) => r.Estado);
      assert.equal(
        states.filter((s, i) => i === 0 || s !== states[i - 1]).length,
        new Set(states).size,
      );
      assert.deepEqual(
        (await report("orden=Estado&direccion=desc")).registros.map(
          (r) => r.Estado,
        ),
        [...full.registros.map((r) => r.Estado)].reverse(),
      );
      assert.equal((await report("pagina=50&limite=1")).registros.length, 7);
      const empty = await report("Desde=2027-01-01");
      assert.deepEqual(empty.totales, { Cantidad: 0, Importe: "0.00" });
      assert.deepEqual(empty.subtotales, []);
    },
  );
  await t.test(
    "Propiedades conserva depósito/acreditación y omite relaciones anuladas del informe",
    async () => {
      const r = await detail(recovered.id);
      assert.deepEqual(
        r.Historial!.map((e) => e.Tipo),
        ["RECEPCION", "DEPOSITO", "ACREDITACION"],
      );
      const credit = r.Historial!.find((e) => e.Tipo === "ACREDITACION")!;
      assert.equal(credit.SentidoBancario, "INGRESO");
      assert.equal(credit.ImporteBancario, "50.05");
      assert.equal(credit.Operacion, null);
      assert.ok(r.Operacion?.startsWith("QR_IN · "));
      assert.equal(
        (await detail(returned.id)).Historial!.find(
          (e) => e.Tipo === "RECEPCION",
        )!.EstadoOperacion,
        "REVERTIDO",
      );
      for (const id of [own.id, cancelled.id, "9223372036854775807"])
        assert.equal(
          (await req("/informes/cheques/terceros/" + id)).status,
          404,
        );
    },
  );
  await t.test(
    "precisión DECIMAL y números de cheque de 30 dígitos sin conversión Number",
    async () => {
      // Fixtures de borde del informe: no se simulan como operatoria comercial real.
      for (const [number, amount] of [
        ["999999999999999999999999999999", "90071992547409.91"],
        ["999999999999999999999999999998", "0.01"],
      ]) {
        await pool.execute(
          "INSERT INTO CHEQUE (Comprobante,Tipo,Numero,Banco,CuentaLibradora,Emision,Vencimiento,Importe,Estado,Usuario,CreadoEn) VALUES ('QR_IN','TERCERO',?,'QR_B','QR_BIG','2026-10-19','2026-11-10',?,'CARTERA',?,?)",
          [number!, amount!, user, new Date()],
        );
      }
      const d = await report("q=QR_BIG&orden=Numero&direccion=desc");
      assert.equal(d.totales.Importe, "90071992547409.92");
      assert.equal(d.registros[0]!.Numero, "999999999999999999999999999999");
      assert.equal(d.subtotales[0]!.Importe, d.totales.Importe);
    },
  );
  await t.test(
    "permisos independientes, referencias acotadas, solo lectura y filtros estrictos",
    async () => {
      assert.equal(
        (await fetch(base + "/informes/cheques/terceros")).status,
        401,
      );
      for (const q of [
        "Estado=ANULADO",
        "Estado=RECEPCION_ANULADA",
        "Estado=EMITIDO",
        "Tipo=PROPIO",
        "Banco=",
        "Desde=2026-02-30",
        "Desde=2026-11-10&Hasta=2026-10-10",
        "orden=Importe;DROP",
        "orden=SinColumna&direccion=asc",
        "orden=Importe",
        "FechaPor=REGISTRO",
      ])
        assert.equal(
          (await req("/informes/cheques/terceros?" + q)).status,
          400,
          q,
        );
      assert.equal((await req("/informes/cheques/terceros/no-id")).status, 400);
      assert.equal(
        (await req("/informes/cheques/terceros/9223372036854775808")).status,
        400,
      );
      const data = {
        nombre: "Consulta cheques QR",
        email: "qr-reader@example.invalid",
        activo: true,
        permisos: [{ menu: "informe-cheques-terceros", escritura: false }],
        password,
      };
      const reader = await json<UserDetail>(
        await req("/usuarios", admin, "POST", data),
        201,
      );
      const who = await login(data.email);
      assert.equal((await req("/informes/cheques/terceros", who)).status, 200);
      assert.equal(
        (await req("/informes/cheques/terceros/" + credited.id, who)).status,
        200,
      );
      for (const path of [
        "/valores",
        "/caja-movimiento",
        "/maestros/bancos",
        "/informes/caja/diario",
      ])
        assert.equal((await req(path, who)).status, 403, path);
      for (const master of ["bancos", "clientes"]) {
        const d = await json<{ registros: Record<string, unknown>[] }>(
          await req("/referencias/" + master + "?limite=100", who),
        );
        assert.ok(d.registros.length);
        assert.ok(!("IDTabla" in d.registros[0]!));
      }
      assert.equal((await req("/referencias/cajas", who)).status, 403);
      assert.equal(
        (
          await req("/usuarios", admin, "POST", {
            ...data,
            email: "qr-write@example.invalid",
            permisos: [{ menu: "informe-cheques-terceros", escritura: true }],
          })
        ).status,
        400,
      );
      const off = await json<UserDetail>(
        await req("/usuarios", admin, "POST", {
          ...data,
          email: "qr-off@example.invalid",
          permisos: [{ menu: "valores", escritura: false }],
        }),
        201,
      );
      assert.ok(off.registro.id && reader.registro.id);
      const no = await login("qr-off@example.invalid");
      assert.equal((await req("/informes/cheques/terceros", no)).status, 403);
    },
  );
  await t.test(
    "ninguna escritura en saldos, instrumentos, eventos, numeradores o auditoría",
    async () => {
      const tables = [
        "CAJASALDO",
        "CAJAMOVIMIENTO",
        "CUENTACORRIENTE",
        "CAJAMOVIMIENTOAFECTACION",
        "CHEQUE",
        "CHEQUEEVENTO",
        "TRANSFERENCIA",
        "BANCOMOVIMIENTO",
        "NUMERACION",
        "AUDITORIA",
        "SOLICITUD",
      ];
      const snapshot = () =>
        Promise.all(
          tables.map((table) =>
            rows(
              "SELECT * FROM " +
                table +
                " ORDER BY " +
                (table === "NUMERACION" ? "Codigo" : "IDTabla"),
            ),
          ),
        );
      const before = await snapshot();
      await report();
      await report("Estado=CARTERA");
      await detail(credited.id);
      await detail(recovered.id);
      assert.deepEqual(await snapshot(), before);
    },
  );
});
