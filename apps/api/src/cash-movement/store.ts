import { cashBankMovements } from "../database/bank-movements.js";
import { listOrder, type ListOrderQuery } from "../database/list-order.js";
import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  compatibleReversal,
  type CashModule,
  voucherNumberError,
  type CashReversalPreview,
  moneyUnits,
  moneyText,
  nextVoucher,
  voucherBase,
  voucherParts,
  type CashInput,
  type CashDetail,
  type CashRecord,
  type CashList,
  type CashOptions,
  type CashOpening,
  type PendingList,
  type ValueDetail,
  type CashValue,
  type RelatedCashMovement,
} from "@erp/shared";
import { financialTransactions } from "../database/financial-transaction.js";
import { lastVoucher } from "../database/voucher-sequence.js";
import { MasterRequestError } from "../masters/validation.js";
import {
  query,
  pendingQuery,
  closing,
  reversal,
  annulment,
} from "./validation.js";
import type { z } from "zod";
type Conn = Pool | PoolConnection;
const eligible =
  "c.Activo=1 AND c.EsReversion=0 AND c.ModuloOrigen='COBROSPAGOS' AND c.Naturaleza='CREDITO' AND ((c.Cuenta='COBRAR' AND c.SentidoFondos='INGRESO') OR (c.Cuenta='PAGAR' AND c.SentidoFondos='EGRESO'))";
// La ausencia de cliente y de asiento comercial identifica fondos internos.
// No se usa la configuración mutable del maestro para reclasificar historia.
const treasuryScope =
  "m.Cliente IS NULL AND NOT EXISTS (SELECT 1 FROM CUENTACORRIENTE scope_cc WHERE scope_cc.CajaMovimiento=m.IDTabla)";
const movementScope = (module: CashModule) =>
  module === "TESORERIA"
    ? "(" + treasuryScope + ")"
    : "NOT (" + treasuryScope + ")";
const joins =
  " FROM CAJAMOVIMIENTO m LEFT JOIN USUARIO u ON u.IDTabla=m.Usuario LEFT JOIN USUARIO ua ON ua.IDTabla=m.UsuarioAnulacion JOIN COMPROBANTE c ON c.Codigo=m.Comprobante LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente LEFT JOIN CAJASALDO cs ON cs.IDTabla=m.CajaSaldo LEFT JOIN CAJA ca ON ca.Codigo=cs.Caja LEFT JOIN CONCEPTO co ON co.Codigo=m.Concepto LEFT JOIN CAJAMOVIMIENTO rev ON rev.CajaMovimientoOrigen=m.IDTabla";
const projection =
  "m.*,(SELECT cc.Cuenta FROM CUENTACORRIENTE cc WHERE cc.CajaMovimiento=m.IDTabla LIMIT 1) AS Cuenta,IF(m.CajaMovimientoOrigen IS NULL AND m.Estado='CONFIRMADO',m.ImporteTotal-COALESCE((SELECT SUM(x.Importe) FROM CAJAMOVIMIENTOAFECTACION x WHERE x.CajaMovimiento=m.IDTabla),0),0) AS DisponibleACuenta,c.Descripcion AS ComprobanteDescripcion,cl.Nombre AS ClienteNombre,ca.Nombre AS CajaNombre,cs.Estado AS JornadaEstado,cs.AperturaEn AS JornadaAperturaEn,u.Nombre AS UsuarioNombre,ua.Nombre AS AnuladoPor,co.Descripcion AS ConceptoDescripcion,rev.IDTabla AS RevertidoPor,DATE_FORMAT(m.FechaOrigen,'%Y-%m-%d') AS FechaOrigen";
const numberSQL = (field: string) =>
  `CONVERT(CONCAT(LPAD((${field} DIV 100000000),4,'0'),'-',LPAD(MOD(${field},100000000),8,'0')) USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const stringify = (r: RowDataPacket) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      v == null ? null : v instanceof Date ? v.toISOString() : String(v),
    ]),
  );
const rec = (r: RowDataPacket) =>
  ({
    ...stringify(r),
    DisponibleACuenta:
      r.Cliente == null && r.Cuenta == null
        ? "0.00"
        : String(r.DisponibleACuenta),
    Estado: r.RevertidoPor ? "REVERTIDO" : String(r.Estado),
    NumeroComprobanteTexto: formatVoucher(
      r.NumeroComprobante == null ? null : String(r.NumeroComprobante),
    ),
  }) as unknown as CashRecord;
const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
function validId(id: string) {
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new MasterRequestError(400, "Identificador inválido.");
}
function fail(message: string, status = 409): never {
  throw new MasterRequestError(status, message);
}
async function lastId(c: PoolConnection) {
  const [r] = await c.query<RowDataPacket[]>(
    "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
  );
  return String(r[0]!.id);
}
async function audit(
  c: PoolConnection,
  user: string,
  action: string,
  table: string,
  id: string,
  data: unknown,
  reason: string | null = null,
) {
  await c.execute(
    "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Motivo,Detalle) VALUES (?,?,?,?,?,?,?)",
    [user, action, table, id, new Date(), reason, JSON.stringify(data)],
  );
}
async function detail(
  c: Conn,
  id: string,
  module: CashModule,
): Promise<CashDetail> {
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT " +
      projection +
      joins +
      " WHERE m.IDTabla=? AND " +
      movementScope(module),
    [id],
  );
  if (!rows[0]) fail("El movimiento no existe.", 404);
  const record = rec(rows[0]);
  const [transfers] = await c.execute<RowDataPacket[]>(
    "SELECT t.IDTabla,'TRANSFERENCIA' AS Tipo,COALESCE(t.Referencia,'') AS Numero,t.BancoCuenta,t.Importe,b.Codigo AS Banco,b.Nombre AS BancoNombre,bc.Nombre AS CuentaNombre,? AS Estado FROM TRANSFERENCIA t JOIN BANCOCUENTA bc ON bc.Codigo=t.BancoCuenta JOIN BANCO b ON b.Codigo=bc.Banco WHERE t.CajaMovimiento=? ORDER BY t.IDTabla",
    [record.Estado === "ANULADO" ? "ANULADA" : "REGISTRADA", id],
  );
  const [cheques] = await c.execute<RowDataPacket[]>(
    "SELECT DISTINCT ch.IDTabla,ch.Tipo,ch.Numero,ch.Banco,ch.BancoCuenta,ch.CuentaLibradora,ch.Importe,ch.Estado,DATE_FORMAT(ch.Emision,'%Y-%m-%d') AS Emision,DATE_FORMAT(ch.Vencimiento,'%Y-%m-%d') AS Vencimiento,b.Nombre AS BancoNombre,bc.Nombre AS CuentaNombre FROM CHEQUEEVENTO e JOIN CHEQUE ch ON ch.IDTabla=e.Cheque JOIN BANCO b ON b.Codigo=ch.Banco LEFT JOIN BANCOCUENTA bc ON bc.Codigo=ch.BancoCuenta WHERE e.CajaMovimiento=? AND e.Tipo IN ('RECEPCION','EMISION','ENDOSO','DEVOLUCION','ANULACION','RECUPERACION') ORDER BY ch.IDTabla",
    [id],
  );
  const [allocations] = await c.execute<RowDataPacket[]>(
    "SELECT x.CuentaCorriente,x.Importe,a.Importe AS ImporteOriginal,a.NumeroComprobante,c.Descripcion AS ComprobanteDescripcion,DATE_FORMAT(a.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,a.Importe-COALESCE((SELECT SUM(y.Importe) FROM CAJAMOVIMIENTOAFECTACION y JOIN CAJAMOVIMIENTO pm ON pm.IDTabla=y.CajaMovimiento WHERE y.CuentaCorriente=a.IDTabla AND pm.Estado='CONFIRMADO'),0) AS Pendiente FROM CAJAMOVIMIENTOAFECTACION x JOIN CUENTACORRIENTE a ON a.IDTabla=x.CuentaCorriente JOIN COMPROBANTE c ON c.Codigo=a.Comprobante WHERE x.CajaMovimiento=? ORDER BY x.IDTabla",
    [id],
  );
  const version = createHash("sha256")
    .update(
      JSON.stringify([
        record.IDTabla,
        record.Estado,
        record.RevertidoPor,
        record.CajaMovimientoOrigen,
        record.ImporteTotal,
      ]),
    )
    .digest("hex");
  const relatedIds = [record.CajaMovimientoOrigen, record.RevertidoPor].filter(
    (v): v is string => Boolean(v),
  );
  const related = new Map<string, RelatedCashMovement>();
  if (relatedIds.length) {
    const [records] = await c.execute<RowDataPacket[]>(
      "SELECT m.IDTabla,c.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante,DATE_FORMAT(m.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,ca.Nombre AS CajaNombre,cs.AperturaEn AS JornadaAperturaEn FROM CAJAMOVIMIENTO m JOIN COMPROBANTE c ON c.Codigo=m.Comprobante LEFT JOIN CAJASALDO cs ON cs.IDTabla=m.CajaSaldo LEFT JOIN CAJA ca ON ca.Codigo=cs.Caja WHERE m.IDTabla IN (" +
        relatedIds.map(() => "?").join(",") +
        ")",
      relatedIds,
    );
    for (const row of records)
      related.set(String(row.IDTabla), {
        ...stringify(row),
        NumeroComprobanteTexto: formatVoucher(String(row.NumeroComprobante)),
      } as unknown as RelatedCashMovement);
  }
  return {
    registro: record,
    relacionados: {
      original: related.get(record.CajaMovimientoOrigen ?? "") ?? null,
      reversion: related.get(record.RevertidoPor ?? "") ?? null,
    },
    version,
    valores: [...transfers, ...cheques].map(
      stringify,
    ) as unknown as ValueDetail[],
    afectaciones: allocations.map((a) => ({
      ...stringify(a),
      NumeroComprobanteTexto: formatVoucher(
        a.NumeroComprobante == null ? null : String(a.NumeroComprobante),
      ),
    })) as CashDetail["afectaciones"],
  };
}
async function cashBalance(c: Conn, o: RowDataPacket) {
  const [r] = await c.execute<RowDataPacket[]>(
    "SELECT Sentido,ImporteEfectivo FROM CAJAMOVIMIENTO WHERE CajaSaldo=? AND Estado='CONFIRMADO'",
    [String(o.IDTabla)],
  );
  return r.reduce(
    (s, m) =>
      s +
      (m.Sentido === "INGRESO" ? 1n : -1n) *
        moneyUnits(String(m.ImporteEfectivo)),
    moneyUnits(String(o.SaldoInicial)),
  );
}
function checkCashBalance(balance: bigint, effect: bigint) {
  const next = balance + effect;
  if (next < 0n) fail("El efectivo disponible no alcanza para la operación.");
  if (next > 999999999999999999n)
    fail("La operación excede el saldo máximo admitido por la caja.", 400);
}
async function opening(c: PoolConnection, id: string) {
  const [r] = await c.execute<RowDataPacket[]>(
    "SELECT cs.*,ca.Nombre AS CajaNombre FROM CAJASALDO cs JOIN CAJA ca ON ca.Codigo=cs.Caja WHERE cs.IDTabla=? AND cs.Estado='ABIERTO' AND ca.Activo=1 FOR UPDATE",
    [id],
  );
  if (!r[0]) fail("Seleccioná una caja activa y abierta.");
  return r[0];
}
async function used(c: Conn, id: string) {
  const [r] = await c.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(x.Importe),0) AS total FROM CAJAMOVIMIENTOAFECTACION x JOIN CAJAMOVIMIENTO m ON m.IDTabla=x.CajaMovimiento WHERE x.CuentaCorriente=? AND m.Estado='CONFIRMADO'",
    [id],
  );
  return moneyUnits(String(r[0]!.total));
}
async function numberStart(c: PoolConnection, code: string, number: string) {
  const [n] = await c.execute<RowDataPacket[]>(
    "SELECT * FROM NUMERACION WHERE Comprobante=? FOR UPDATE",
    [code],
  );
  for (const table of ["CUENTACORRIENTE", "CAJAMOVIMIENTO"]) {
    const [r] = await c.execute<RowDataPacket[]>(
      `SELECT IDTabla FROM ${table} WHERE Comprobante=? AND NumeroComprobante=? LIMIT 1`,
      [code, number],
    );
    if (r.length)
      fail(
        "Ese comprobante y número ya están registrados, incluidos los revertidos.",
      );
  }
  return n[0];
}
async function numberFinish(
  c: PoolConnection,
  code: string,
  value: string,
  n: RowDataPacket | undefined,
) {
  if (
    n?.Activo &&
    BigInt(n.ProximoNumero) / voucherBase === BigInt(value) / voucherBase
  ) {
    const highest = (await lastVoucher(c, code, value))!;
    const next = nextVoucher(highest.toString());
    await c.execute(
      "UPDATE NUMERACION SET ProximoNumero=?,Activo=? WHERE IDTabla=?",
      [
        next === null
          ? highest.toString()
          : BigInt(next) > BigInt(n.ProximoNumero)
            ? next
            : String(n.ProximoNumero),
        next === null ? 0 : 1,
        String(n.IDTabla),
      ],
    );
  }
}
async function canonical(pool: Pool, code: string) {
  const [r] = await pool.execute<RowDataPacket[]>(
    "SELECT Codigo FROM COMPROBANTE WHERE Codigo=?",
    [code],
  );
  if (!r[0]) fail("El comprobante no existe.", 400);
  return String(r[0].Codigo);
}
async function saveTransfer(
  c: PoolConnection,
  code: string,
  id: string,
  date: string,
  account: string,
  amount: string,
  reference: string | null,
  sense: string,
  user: string,
) {
  await c.execute(
    "INSERT INTO TRANSFERENCIA (Comprobante,CajaMovimiento,BancoCuenta,Fecha,Importe,Referencia,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?)",
    [code, id, account, date, amount, reference, user, new Date()],
  );
  const t = await lastId(c);
  await c.execute(
    "INSERT INTO BANCOMOVIMIENTO (BancoCuenta,Fecha,Sentido,Importe,Origen,Transferencia,Usuario,CreadoEn) VALUES (?,?,?,?,'TRANSFERENCIA',?,?,?)",
    [account, date, sense, amount, t, user, new Date()],
  );
}
async function account(c: PoolConnection, code: string) {
  const [r] = await c.execute<RowDataPacket[]>(
    "SELECT bc.* FROM BANCOCUENTA bc JOIN BANCO b ON b.Codigo=bc.Banco WHERE bc.Codigo=? AND bc.Activo=1 AND b.Activo=1 LOCK IN SHARE MODE",
    [code],
  );
  if (!r[0]) fail("Seleccioná una cuenta bancaria activa.", 400);
  return r[0];
}
/** La asociación se vuelve a comprobar bajo bloqueo antes de confirmar. */
async function reversalSetup(c: Conn, id: string) {
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT v.ComprobanteReversion FROM CAJAMOVIMIENTO m JOIN COMPROBANTE v ON v.Codigo=m.Comprobante WHERE m.IDTabla=?",
    [id],
  );
  if (!rows[0]) fail("El movimiento no existe.", 404);
  if (!rows[0].ComprobanteReversion)
    fail(
      "Configurá el comprobante de reversión asociado al comprobante original.",
    );
  return String(rows[0].ComprobanteReversion);
}
async function reversalVoucher(
  c: Conn,
  original: CashRecord,
  code: string,
  lock = false,
  module: CashModule = "COBROSPAGOS",
) {
  const [source] = await c.execute<RowDataPacket[]>(
    "SELECT ComprobanteReversion FROM COMPROBANTE WHERE Codigo=?" +
      (lock ? " LOCK IN SHARE MODE" : ""),
    [original.Comprobante],
  );
  if (source[0]?.ComprobanteReversion !== code)
    fail("La configuración de reversión cambió. Volvé a abrir la operación.");
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT * FROM COMPROBANTE WHERE Codigo=?" +
      (lock ? " LOCK IN SHARE MODE" : ""),
    [code],
  );
  const target = rows[0];
  if (
    !target ||
    !target.Activo ||
    target.ComprobanteReversion ||
    !compatibleReversal(
      {
        ModuloOrigen: module,
        Cuenta: module === "TESORERIA" ? "NOAPLICA" : original.Cuenta,
        SentidoFondos: original.Sentido,
      },
      {
        ModuloOrigen: target.ModuloOrigen,
        Cuenta: target.Cuenta,
        Naturaleza: target.Naturaleza,
        SentidoFondos: target.SentidoFondos,
        EsReversion: Boolean(target.EsReversion),
      },
    )
  )
    fail(
      "El comprobante asociado debe estar activo, ser exclusivo para reversiones, del mismo módulo, con la cuenta y naturaleza correspondientes y sentido de fondos contrario.",
    );
  return target;
}
function checkReversalNumerator(n: RowDataPacket | undefined) {
  if (!n?.Activo || voucherNumberError(String(n.ProximoNumero)))
    fail(
      "Configurá un Numerador activo con un próximo número válido para el comprobante de reversión.",
    );
}
function ensureInternalCash(d: CashDetail) {
  const r = d.registro;
  if (
    r.Cliente !== null ||
    r.Cuenta !== null ||
    d.valores.length ||
    d.afectaciones.length ||
    moneyUnits(r.ImporteACuenta) !== 0n ||
    moneyUnits(r.ImporteEfectivo) !== moneyUnits(r.ImporteTotal)
  )
    fail(
      "La operación no corresponde a efectivo interno simple y requiere revisión.",
    );
}
export function createCashMovementStore(
  pool: Pool,
  module: CashModule = "COBROSPAGOS",
) {
  const treasury = module === "TESORERIA";
  const movementDetail = (c: Conn, id: string) => detail(c, id, module);
  const tx = financialTransactions(pool, true);
  return {
    async openingStatus(id: string) {
      validId(id);
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT cs.IDTabla,cs.Caja,cs.Estado,ca.Nombre AS CajaNombre,ca.Activo FROM CAJASALDO cs JOIN CAJA ca ON ca.Codigo=cs.Caja WHERE cs.IDTabla=?",
        [id],
      );
      if (!rows[0]) fail("La apertura no existe.", 404);
      return stringify(rows[0]);
    },
    async options(): Promise<CashOptions> {
      const [v] = await pool.query<RowDataPacket[]>(
        "SELECT c.Codigo,c.Descripcion,c.Cuenta,c.Naturaleza,c.SentidoFondos FROM COMPROBANTE c WHERE c.Activo=1 AND c.EsReversion=0 AND c.ModuloOrigen=? ORDER BY c.Orden,c.Codigo",
        [module],
      );
      const [n] = await pool.query<RowDataPacket[]>(
        "SELECT Comprobante,ProximoNumero FROM NUMERACION WHERE Activo=1",
      );
      const [b] = treasury
        ? [[]]
        : await pool.query<RowDataPacket[]>(
            "SELECT Codigo,Nombre FROM BANCO WHERE Activo=1 ORDER BY Nombre",
          );
      const [a] = treasury
        ? [[]]
        : await pool.query<RowDataPacket[]>(
            "SELECT bc.Codigo,bc.Nombre,bc.Banco FROM BANCOCUENTA bc JOIN BANCO b ON b.Codigo=bc.Banco WHERE bc.Activo=1 AND b.Activo=1 ORDER BY bc.Nombre",
          );
      const [cajas] = await pool.query<RowDataPacket[]>(
        "SELECT Codigo,Nombre FROM CAJA WHERE Activo=1 ORDER BY Nombre",
      );
      const [conceptos] = await pool.query<RowDataPacket[]>(
        "SELECT Codigo,Descripcion FROM CONCEPTO WHERE Activo=1 ORDER BY Descripcion",
      );
      const [o] = await pool.query<RowDataPacket[]>(
        "SELECT cs.*,ca.Nombre AS CajaNombre FROM CAJASALDO cs JOIN CAJA ca ON ca.Codigo=cs.Caja WHERE cs.Estado='ABIERTO' ORDER BY cs.IDTabla ASC",
      );
      const aperturas = [];
      for (const row of o)
        aperturas.push({
          ...stringify(row),
          SaldoActual: moneyText(await cashBalance(pool, row)),
        });
      return {
        comprobantes: v.map(stringify),
        numeradores: n.map(stringify),
        bancos: b.map(stringify),
        cuentas: a.map(stringify),
        cajas: cajas.map(stringify),
        conceptos: conceptos.map(stringify),
        aperturas,
      } as unknown as CashOptions;
    },
    async list(q: z.infer<typeof query>): Promise<CashList> {
      const order = listOrder(
        q,
        {
          FechaOrigen: "m.FechaOrigen",
          Comprobante: "c.Descripcion",
          NumeroComprobante: "m.NumeroComprobante",
          Cliente: "cl.Nombre",
          Caja: "ca.Nombre",
          Concepto: "co.Descripcion",
          Sentido: "m.Sentido",
          ImporteTotal: "m.ImporteTotal",
          Estado:
            "CASE WHEN m.Estado='ANULADO' THEN 'Anulado' WHEN rev.IDTabla IS NOT NULL THEN 'Revertido' WHEN m.CajaMovimientoOrigen IS NOT NULL THEN 'Confirmado · Reversión' ELSE 'Confirmado' END",
        },
        "m.IDTabla",
      );
      const p: (string | number)[] = [],
        clauses: string[] = [movementScope(module)];
      if (q.Estado === "ANULADO") clauses.push("m.Estado='ANULADO'");
      else if (q.Estado === "REVERTIDO")
        clauses.push("rev.IDTabla IS NOT NULL");
      else if (q.Estado === "CONFIRMADO")
        clauses.push("m.Estado='CONFIRMADO' AND rev.IDTabla IS NULL");
      if (q.Desde) {
        clauses.push("m.FechaOrigen>=?");
        p.push(q.Desde);
      }
      if (q.Hasta) {
        clauses.push("m.FechaOrigen<=?");
        p.push(q.Hasta);
      }
      if (q.q) {
        clauses.push(
          `(cl.Nombre LIKE ? ESCAPE '!' OR c.Descripcion LIKE ? ESCAPE '!' OR m.Observacion LIKE ? ESCAPE '!' OR m.Cliente LIKE ? ESCAPE '!' ${treasury ? "OR co.Descripcion LIKE ? ESCAPE '!' OR ca.Nombre LIKE ? ESCAPE '!'" : ""} OR ${numberSQL("m.NumeroComprobante")} LIKE ? ESCAPE '!')`,
        );
        p.push(
          ...Array(treasury ? 7 : 5).fill(
            "%" + q.q.replace(/[!%_]/g, "!$&") + "%",
          ),
        );
      }
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const [count] = await c.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total" + joins + where,
          p,
        );
        const [r] = await c.execute<RowDataPacket[]>(
          "SELECT " +
            projection +
            joins +
            where +
            " ORDER BY " +
            order +
            " LIMIT ? OFFSET ?",
          [...p, q.limite, (q.pagina - 1) * q.limite],
        );
        await c.commit();
        return {
          registros: r.map(rec),
          total: Number(count[0]!.total),
          pagina: q.pagina,
          limite: q.limite,
        };
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
    async get(id: string) {
      validId(id);
      return movementDetail(pool, id);
    },
    async pending(q: z.infer<typeof pendingQuery>): Promise<PendingList> {
      const order = listOrder(
        q,
        {
          Comprobante: "c.Descripcion",
          FechaOrigen: "a.FechaOrigen",
          Importe: "a.Importe",
          Pendiente: "a.Importe-COALESCE(x.Aplicado,0)",
        },
        "a.IDTabla",
      );
      const [v] = await pool.execute<RowDataPacket[]>(
        "SELECT c.Cuenta FROM COMPROBANTE c WHERE c.Codigo=? AND " + eligible,
        [q.Comprobante],
      );
      if (!v[0])
        fail("Seleccioná un comprobante de cobro o pago compatible.", 400);
      const from =
        " FROM CUENTACORRIENTE a JOIN COMPROBANTE c ON c.Codigo=a.Comprobante LEFT JOIN (SELECT x.CuentaCorriente,SUM(x.Importe) AS Aplicado FROM CAJAMOVIMIENTOAFECTACION x JOIN CAJAMOVIMIENTO m ON m.IDTabla=x.CajaMovimiento WHERE m.Estado='CONFIRMADO' GROUP BY x.CuentaCorriente) x ON x.CuentaCorriente=a.IDTabla WHERE a.Cliente=? AND a.Cuenta=? AND a.Naturaleza='DEUDA' AND a.Estado='CONFIRMADO' AND a.Importe-COALESCE(x.Aplicado,0)>0";
      const p: (string | number)[] = [q.Cliente, String(v[0].Cuenta)];
      let filter = q.q
        ? ` AND (c.Descripcion LIKE ? ESCAPE '!' OR ${numberSQL("a.NumeroComprobante")} LIKE ? ESCAPE '!')`
        : "";
      if (q.q)
        p.push(...Array(2).fill("%" + q.q.replace(/[!%_]/g, "!$&") + "%"));
      if (q.Excluir.length) {
        filter += ` AND a.IDTabla NOT IN (${q.Excluir.map(() => "?").join(",")})`;
        p.push(...q.Excluir);
      }
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const [count] = await c.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total" + from + filter,
          p,
        );
        const [r] = await c.execute<RowDataPacket[]>(
          "SELECT a.IDTabla,c.Descripcion AS ComprobanteDescripcion,a.NumeroComprobante,DATE_FORMAT(a.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,DATE_FORMAT(a.Vencimiento,'%Y-%m-%d') AS Vencimiento,a.Importe,a.Importe-COALESCE(x.Aplicado,0) AS Pendiente" +
            from +
            filter +
            " ORDER BY " +
            order +
            " LIMIT ? OFFSET ?",
          [...p, q.limite, (q.pagina - 1) * q.limite],
        );
        await c.commit();
        return {
          registros: r.map((r) => ({
            ...stringify(r),
            NumeroComprobanteTexto: formatVoucher(
              r.NumeroComprobante == null ? null : String(r.NumeroComprobante),
            ),
          })),
          total: Number(count[0]!.total),
          pagina: q.pagina,
          limite: q.limite,
        } as PendingList;
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
    async cheque(id: string) {
      validId(id);
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT ch.*,b.Nombre AS BancoNombre,bc.Nombre AS CuentaNombre,DATE_FORMAT(ch.Emision,'%Y-%m-%d') AS Emision,DATE_FORMAT(ch.Vencimiento,'%Y-%m-%d') AS Vencimiento FROM CHEQUE ch JOIN BANCO b ON b.Codigo=ch.Banco LEFT JOIN BANCOCUENTA bc ON bc.Codigo=ch.BancoCuenta WHERE ch.IDTabla=?",
        [id],
      );
      if (!rows[0]) fail("El cheque no existe.", 404);
      return stringify(rows[0]);
    },
    async portfolio(
      q: { q: string; pagina: number; limite: number } & ListOrderQuery,
    ) {
      const order = listOrder(
        q,
        {
          Numero: "CAST(ch.Numero AS DECIMAL(30,0))",
          Banco: "b.Nombre",
          Vencimiento: "ch.Vencimiento",
          Importe: "ch.Importe",
        },
        "ch.IDTabla",
      );
      const pattern = "%" + q.q.replace(/[!%_]/g, "!$&") + "%";
      const from =
        " FROM CHEQUE ch JOIN BANCO b ON b.Codigo=ch.Banco WHERE ch.Tipo='TERCERO' AND ch.Estado='CARTERA' AND (ch.Numero LIKE ? ESCAPE '!' OR b.Nombre LIKE ? ESCAPE '!' OR ch.Librador LIKE ? ESCAPE '!')";
      const [count] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total" + from,
        [pattern, pattern, pattern],
      );
      const [r] = await pool.execute<RowDataPacket[]>(
        "SELECT ch.*,b.Nombre AS BancoNombre,NULL AS CuentaNombre,DATE_FORMAT(ch.Emision,'%Y-%m-%d') AS Emision,DATE_FORMAT(ch.Vencimiento,'%Y-%m-%d') AS Vencimiento" +
          from +
          " ORDER BY " +
          order +
          " LIMIT ? OFFSET ?",
        [pattern, pattern, pattern, q.limite, (q.pagina - 1) * q.limite],
      );
      return {
        registros: r.map(stringify) as unknown as ValueDetail[],
        total: Number(count[0]!.total),
        pagina: q.pagina,
        limite: q.limite,
      };
    },
    async open(
      input: { Caja: string; SaldoInicial: string },
      user: string,
      key: string,
    ) {
      return tx(user, "CAJA_ABRIR", key, input, async (c) => {
        const [boxes] = await c.execute<RowDataPacket[]>(
          "SELECT Codigo FROM CAJA WHERE Codigo=? AND Activo=1 FOR UPDATE",
          [input.Caja],
        );
        if (!boxes[0]) fail("Seleccioná una caja activa.", 400);
        const [r] = await c.execute<RowDataPacket[]>(
          "SELECT IDTabla FROM CAJASALDO WHERE Caja=? AND Estado='ABIERTO' FOR UPDATE",
          [boxes[0].Codigo],
        );
        if (r.length) fail("La caja ya tiene una apertura activa.");
        await c.execute(
          "INSERT INTO CAJASALDO (Caja,AperturaEn,SaldoInicial,UsuarioApertura,Estado) VALUES (?,?,?,?,'ABIERTO')",
          [boxes[0].Codigo, new Date(), input.SaldoInicial, user],
        );
        const id = await lastId(c);
        await audit(c, user, "APERTURA", "CAJASALDO", id, input);
        return { IDTabla: id };
      });
    },
    async close(
      id: string,
      input: z.infer<typeof closing>,
      user: string,
      key: string,
    ) {
      validId(id);
      return tx(user, "CAJA_CERRAR", key, { id, ...input }, async (c) => {
        const o = await opening(c, id);
        const balance = await cashBalance(c, o);
        const difference = moneyUnits(input.SaldoContado) - balance;
        if (difference !== 0n && !input.Observacion)
          fail(
            "Ingresá una observación para registrar la diferencia de caja.",
            400,
          );
        await c.execute(
          "UPDATE CAJASALDO SET Estado='CERRADO',CierreEn=?,SaldoTeorico=?,SaldoContado=?,UsuarioCierre=?,Observacion=? WHERE IDTabla=?",
          [
            new Date(),
            moneyText(balance),
            input.SaldoContado,
            user,
            input.Observacion,
            id,
          ],
        );
        await audit(
          c,
          user,
          "CIERRE",
          "CAJASALDO",
          id,
          {
            SaldoTeorico: moneyText(balance),
            SaldoContado: input.SaldoContado,
            Diferencia: moneyText(difference),
          },
          input.Observacion,
        );
        return {
          SaldoTeorico: moneyText(balance),
          Diferencia: moneyText(difference),
        };
      });
    },
    async create(input: CashInput, user: string, key: string) {
      const code = await canonical(pool, input.Comprobante),
        number = input.NumeroComprobante;
      return tx(
        user,
        treasury ? "TESORERIA_ALTA" : "CAJA_ALTA",
        key,
        input,
        async (c) => {
          const n = await numberStart(c, code, number);
          const [v] = await c.execute<RowDataPacket[]>(
            "SELECT c.* FROM COMPROBANTE c WHERE c.Codigo=? AND " +
              (treasury
                ? "c.Activo=1 AND c.EsReversion=0 AND c.ModuloOrigen='TESORERIA' AND c.Cuenta='NOAPLICA' AND c.Naturaleza='NOAPLICA' AND c.SentidoFondos IN ('INGRESO','EGRESO')"
                : eligible) +
              " LOCK IN SHARE MODE",
            [code],
          );
          const voucher = v[0];
          if (!voucher)
            fail(
              treasury
                ? "Seleccioná un comprobante normal de Tesorería, Cuenta y Naturaleza No aplica, con sentido Ingreso o Egreso."
                : "El comprobante debe ser Crédito, Cobrar/Ingreso o Pagar/Egreso de Cobros y pagos.",
              400,
            );
          let client = "";
          if (!treasury) {
            const [clients] = await c.execute<RowDataPacket[]>(
              "SELECT Codigo FROM CLIENTE WHERE Codigo=? AND Activo=1 LOCK IN SHARE MODE",
              [input.Cliente],
            );
            if (!clients[0]) fail("Seleccioná un cliente activo.", 400);
            client = String(clients[0].Codigo);
          }
          const box = await opening(c, input.CajaSaldo);
          if (input.Concepto) {
            const [r] = await c.execute<RowDataPacket[]>(
              "SELECT Codigo FROM CONCEPTO WHERE Codigo=? AND Activo=1 LOCK IN SHARE MODE",
              [input.Concepto],
            );
            if (!r[0]) fail("Seleccioná un concepto activo.", 400);
          }
          if (treasury) {
            if (
              !input.Concepto ||
              input.Cliente ||
              input.Valores.length ||
              input.Afectaciones.length ||
              moneyUnits(input.ImporteACuenta) !== 0n
            )
              fail(
                "Tesorería admite solamente efectivo y un concepto, sin cliente ni afectaciones.",
                400,
              );
            const total = moneyUnits(input.ImporteEfectivo);
            if (total <= 0n) fail("El importe debe ser mayor que cero.", 400);
            checkCashBalance(
              await cashBalance(c, box),
              (voucher.SentidoFondos === "INGRESO" ? 1n : -1n) * total,
            );
            await c.execute(
              "INSERT INTO CAJAMOVIMIENTO (Comprobante,NumeroComprobante,Cliente,FechaOrigen,CajaSaldo,Concepto,ImporteEfectivo,ImporteACuenta,ImporteTotal,Sentido,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,NULL,?,?,?,?,0,?,?,?,'CONFIRMADO',?,?)",
              [
                code,
                number,
                input.FechaOrigen,
                input.CajaSaldo,
                input.Concepto,
                input.ImporteEfectivo,
                input.ImporteEfectivo,
                voucher.SentidoFondos,
                input.Observacion,
                user,
                new Date(),
              ],
            );
            const id = await lastId(c);
            await numberFinish(c, code, number, n);
            const after = await movementDetail(c, id);
            await audit(c, user, "ALTA_TESORERIA", "CAJAMOVIMIENTO", id, {
              Despues: after,
            });
            return after;
          }
          const ids = input.Afectaciones.map((a) => a.CuentaCorriente).sort(
            (a, b) => (BigInt(a) < BigInt(b) ? -1 : 1),
          );
          if (ids.length) {
            const [r] = await c.execute<RowDataPacket[]>(
              `SELECT * FROM CUENTACORRIENTE WHERE IDTabla IN (${ids.map(() => "?").join(",")}) ORDER BY IDTabla FOR UPDATE`,
              ids,
            );
            for (const a of input.Afectaciones) {
              const debt = r.find(
                (d) => String(d.IDTabla) === a.CuentaCorriente,
              );
              if (
                !debt ||
                debt.Cliente !== client ||
                debt.Cuenta !== voucher.Cuenta ||
                debt.Naturaleza !== "DEUDA" ||
                debt.Estado !== "CONFIRMADO"
              )
                fail(
                  "Una afectación no corresponde al cliente y cuenta seleccionados.",
                );
              if (
                moneyUnits(a.Importe) >
                moneyUnits(String(debt.Importe)) -
                  (await used(c, a.CuentaCorriente))
              )
                fail(
                  "Cambió el saldo pendiente de un documento. Revisá las afectaciones.",
                );
            }
          }
          let total = moneyUnits(input.ImporteEfectivo);
          const existing = new Map<string, RowDataPacket>();
          const identities = new Set<string>();
          for (const bank of [
            ...new Set(
              input.Valores.flatMap((v) =>
                v.Tipo === "PROPIO" || v.Tipo === "TERCERO" ? [v.Banco] : [],
              ),
            ),
          ].sort()) {
            const [r] = await c.execute<RowDataPacket[]>(
              "SELECT Codigo FROM BANCO WHERE Codigo=? AND Activo=1 FOR UPDATE",
              [bank],
            );
            if (!r[0]) fail("Seleccioná bancos activos.", 400);
          }
          for (const value of input.Valores) {
            if (value.Tipo === "TRANSFERENCIA") {
              await account(c, value.BancoCuenta);
              total += moneyUnits(value.Importe);
              continue;
            }
            if (value.Tipo === "CARTERA") {
              if (voucher.SentidoFondos !== "EGRESO")
                fail("Los cheques de cartera se utilizan en pagos.", 400);
              const [r] = await c.execute<RowDataPacket[]>(
                "SELECT * FROM CHEQUE WHERE IDTabla=? AND Tipo='TERCERO' AND Estado='CARTERA' FOR UPDATE",
                [value.Cheque],
              );
              if (!r[0] || existing.has(value.Cheque))
                fail("Un cheque ya no está disponible en cartera.");
              existing.set(value.Cheque, r[0]);
              total += moneyUnits(String(r[0].Importe));
              continue;
            }
            const identity = JSON.stringify([
              value.Tipo,
              value.Banco.toUpperCase(),
              value.Tipo === "PROPIO"
                ? value.BancoCuenta?.toUpperCase()
                : value.CuentaLibradora,
              BigInt(value.Numero).toString(),
            ]);
            if (identities.has(identity))
              fail("No repitas un cheque en el movimiento.", 400);
            identities.add(identity);
            if (
              (value.Tipo === "PROPIO") !==
              (voucher.SentidoFondos === "EGRESO")
            )
              fail(
                "Los cheques propios se emiten en pagos; los nuevos de terceros se reciben en cobros.",
                400,
              );
            if (value.Tipo === "PROPIO") {
              const a = await account(c, value.BancoCuenta!);
              if (a.Banco !== value.Banco)
                fail("El banco del cheque no corresponde a su cuenta.", 400);
            }
            const condition =
              value.Tipo === "PROPIO"
                ? "BancoCuenta=?"
                : "(CuentaLibradora=? OR CuentaLibradora IS NULL)";
            const [r] = await c.execute<RowDataPacket[]>(
              `SELECT IDTabla FROM CHEQUE WHERE Tipo=? AND Banco=? AND ${condition} AND Numero REGEXP '^[0-9]+$' AND CAST(Numero AS DECIMAL(30,0))=CAST(? AS DECIMAL(30,0)) LIMIT 1`,
              [
                value.Tipo,
                value.Banco.toUpperCase(),
                value.Tipo === "PROPIO"
                  ? value.BancoCuenta
                  : value.CuentaLibradora,
                value.Numero,
              ],
            );
            if (r.length) fail("Ese cheque ya se encuentra registrado.");
            total += moneyUnits(value.Importe);
          }
          const allocated = input.Afectaciones.reduce(
            (s, a) => s + moneyUnits(a.Importe),
            0n,
          );
          if (
            total <= 0n ||
            total > 999999999999999999n ||
            total !== allocated + moneyUnits(input.ImporteACuenta)
          )
            fail(
              "Los medios de pago deben coincidir con las afectaciones más el importe a cuenta.",
              400,
            );
          checkCashBalance(
            await cashBalance(c, box),
            (voucher.SentidoFondos === "INGRESO" ? 1n : -1n) *
              moneyUnits(input.ImporteEfectivo),
          );
          const now = new Date();
          await c.execute(
            "INSERT INTO CAJAMOVIMIENTO (Comprobante,NumeroComprobante,Cliente,FechaOrigen,CajaSaldo,Concepto,ImporteEfectivo,ImporteACuenta,ImporteTotal,Sentido,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?,?,'CONFIRMADO',?,?)",
            [
              code,
              number,
              client,
              input.FechaOrigen,
              input.CajaSaldo,
              input.Concepto,
              input.ImporteEfectivo,
              input.ImporteACuenta,
              moneyText(total),
              voucher.SentidoFondos,
              input.Observacion,
              user,
              now,
            ],
          );
          const id = await lastId(c);
          await c.execute(
            "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,CajaMovimiento,NumeroComprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,'CREDITO',?,?,'CONFIRMADO',?,?)",
            [
              client,
              code,
              id,
              number,
              input.FechaOrigen,
              voucher.Cuenta,
              moneyText(total),
              input.Observacion,
              user,
              now,
            ],
          );
          const creditId = await lastId(c);
          for (const a of input.Afectaciones)
            await c.execute(
              "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe,CreadoEn,Usuario) VALUES (?,?,?,?,?)",
              [id, a.CuentaCorriente, a.Importe, now, user],
            );
          for (const value of input.Valores) {
            if (value.Tipo === "TRANSFERENCIA") {
              await saveTransfer(
                c,
                code,
                id,
                input.FechaOrigen,
                value.BancoCuenta,
                value.Importe,
                value.Referencia,
                voucher.SentidoFondos,
                user,
              );
              continue;
            }
            let chequeId: string, event: string, state: string;
            if (value.Tipo === "CARTERA") {
              chequeId = value.Cheque;
              event = "ENDOSO";
              state = "ENDOSADO";
              await c.execute("UPDATE CHEQUE SET Estado=? WHERE IDTabla=?", [
                state,
                chequeId,
              ]);
            } else {
              event = value.Tipo === "PROPIO" ? "EMISION" : "RECEPCION";
              state = value.Tipo === "PROPIO" ? "EMITIDO" : "CARTERA";
              await c.execute(
                "INSERT INTO CHEQUE (Comprobante,Tipo,Numero,Banco,BancoCuenta,CuentaLibradora,Librador,Documento,Emision,Vencimiento,Importe,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                  code,
                  value.Tipo,
                  value.Numero,
                  value.Banco,
                  value.Tipo === "PROPIO" ? value.BancoCuenta : null,
                  value.Tipo === "TERCERO" ? value.CuentaLibradora : null,
                  value.Librador,
                  value.Documento,
                  value.Emision,
                  value.Vencimiento,
                  value.Importe,
                  state,
                  user,
                  now,
                ],
              );
              chequeId = await lastId(c);
            }
            await c.execute(
              "INSERT INTO CHEQUEEVENTO (Cheque,Tipo,Fecha,CajaMovimiento,Usuario,CreadoEn) VALUES (?,?,?,?,?,?)",
              [chequeId, event, input.FechaOrigen, id, user, now],
            );
            await audit(c, user, event, "CHEQUE", chequeId, {
              CajaMovimiento: id,
              Estado: state,
            });
          }
          await numberFinish(c, code, number, n);
          const result = await movementDetail(c, id);
          await audit(c, user, "ALTA", "CAJAMOVIMIENTO", id, result);
          await audit(c, user, "ALTA_DESDE_CAJA", "CUENTACORRIENTE", creditId, {
            CajaMovimiento: id,
            Importe: moneyText(total),
          });
          return result;
        },
        JSON.stringify([code, voucherParts(number).point]),
      );
    },
    async annul(
      id: string,
      input: z.infer<typeof annulment>,
      version: string,
      user: string,
      key: string,
    ) {
      validId(id);
      return tx(
        user,
        treasury ? "TESORERIA_ANULAR" : "CAJA_ANULAR",
        key,
        { id, ...input, version },
        async (c) => {
          const box = await opening(c, input.CajaSaldo);
          const [locked] = await c.execute<RowDataPacket[]>(
            "SELECT IDTabla FROM CAJAMOVIMIENTO WHERE IDTabla=? FOR UPDATE",
            [id],
          );
          if (!locked[0]) fail("El movimiento no existe.", 404);
          const before = await movementDetail(c, id),
            r = before.registro;
          if (
            before.version !== version ||
            r.Estado !== "CONFIRMADO" ||
            r.RevertidoPor ||
            r.CajaMovimientoOrigen
          )
            fail(
              "El movimiento cambió, está anulado o tiene una reversión. Volvé a consultarlo.",
            );
          if (r.CajaSaldo !== input.CajaSaldo)
            fail(
              "Para anular, seleccioná la misma apertura de caja del movimiento original.",
            );
          let creditId: string | null = null;
          if (treasury) ensureInternalCash(before);
          else {
            const [credits] = await c.execute<RowDataPacket[]>(
              "SELECT IDTabla FROM CUENTACORRIENTE WHERE CajaMovimiento=?",
              [id],
            );
            if (!credits[0])
              fail("Falta el crédito de Cuenta corriente relacionado.");
            creditId = String(credits[0].IDTabla);
            const accounts = [
              ...new Set([
                creditId,
                ...before.afectaciones.map((a) => a.CuentaCorriente),
              ]),
            ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
            const [accountRows] = await c.execute<RowDataPacket[]>(
              "SELECT * FROM CUENTACORRIENTE WHERE IDTabla IN (" +
                accounts.map(() => "?").join(",") +
                ") ORDER BY IDTabla FOR UPDATE",
              accounts,
            );
            const credit = accountRows.find(
              (a) => String(a.IDTabla) === creditId,
            );
            if (
              !credit ||
              credit.Estado !== "CONFIRMADO" ||
              credit.Naturaleza !== "CREDITO" ||
              credit.Cuenta !== r.Cuenta ||
              moneyUnits(String(credit.Importe)) !== moneyUnits(r.ImporteTotal)
            )
              fail("El crédito relacionado requiere revisión antes de anular.");
            const applied = before.afectaciones.reduce(
              (sum, a) => sum + moneyUnits(a.Importe),
              0n,
            );
            if (
              (await used(c, creditId)) > 0n ||
              applied !==
                moneyUnits(r.ImporteTotal) - moneyUnits(r.ImporteACuenta)
            )
              fail(
                "El movimiento tiene aplicaciones posteriores. Deben resolverse antes de anular.",
              );
          }
          const [transfers] = await c.execute<RowDataPacket[]>(
            "SELECT IDTabla FROM TRANSFERENCIA WHERE CajaMovimiento=? FOR UPDATE",
            [id],
          );
          if (transfers.length && !input.ConfirmarCorreccionBancaria)
            fail(
              "Confirmá que se trata de una corrección de registración y no de deshacer una transferencia bancaria ejecutada.",
              400,
            );
          checkCashBalance(
            await cashBalance(c, box),
            (r.Sentido === "INGRESO" ? -1n : 1n) *
              moneyUnits(r.ImporteEfectivo),
          );
          const [events] = await c.execute<RowDataPacket[]>(
            "SELECT * FROM CHEQUEEVENTO WHERE CajaMovimiento=? AND Tipo IN ('RECEPCION','EMISION','ENDOSO') ORDER BY Cheque FOR UPDATE",
            [id],
          );
          for (const e of events) {
            const [cheques] = await c.execute<RowDataPacket[]>(
              "SELECT * FROM CHEQUE WHERE IDTabla=? FOR UPDATE",
              [String(e.Cheque)],
            );
            const cheque = cheques[0];
            const expected =
              e.Tipo === "RECEPCION"
                ? "CARTERA"
                : e.Tipo === "EMISION"
                  ? "EMITIDO"
                  : "ENDOSADO";
            const [later] = await c.execute<RowDataPacket[]>(
              "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND IDTabla>? LIMIT 1",
              [String(e.Cheque), String(e.IDTabla)],
            );
            if (!cheque || cheque.Estado !== expected || later.length)
              fail(
                "Un cheque tiene cambios posteriores. Deben resolverse antes de anular el movimiento.",
              );
          }
          const bankBefore = await cashBankMovements(c, id);
          const now = new Date();
          await c.execute(
            "UPDATE CAJAMOVIMIENTO SET Estado='ANULADO',UsuarioAnulacion=?,AnuladoEn=?,MotivoAnulacion=? WHERE IDTabla=?",
            [user, now, input.Motivo, id],
          );
          if (creditId)
            await c.execute(
              "UPDATE CUENTACORRIENTE SET Estado='ANULADO',UsuarioAnulacion=?,AnuladoEn=?,MotivoAnulacion=? WHERE IDTabla=?",
              [user, now, input.Motivo, creditId],
            );
          for (const e of events) {
            const state =
              e.Tipo === "RECEPCION"
                ? "RECEPCION_ANULADA"
                : e.Tipo === "EMISION"
                  ? "ANULADO"
                  : "CARTERA";
            const type =
              e.Tipo === "RECEPCION"
                ? "ANULACION_RECEPCION"
                : e.Tipo === "EMISION"
                  ? "ANULACION"
                  : "RECUPERACION";
            await c.execute("UPDATE CHEQUE SET Estado=? WHERE IDTabla=?", [
              state,
              String(e.Cheque),
            ]);
            await c.execute(
              "INSERT INTO CHEQUEEVENTO (Cheque,Tipo,Fecha,CajaMovimiento,Usuario,CreadoEn,Observacion) VALUES (?,?,?,?,?,?,?)",
              [String(e.Cheque), type, today(), id, user, now, input.Motivo],
            );
            await audit(
              c,
              user,
              type,
              "CHEQUE",
              String(e.Cheque),
              { CajaMovimiento: id },
              input.Motivo,
            );
          }
          const after = await movementDetail(c, id);
          if (creditId)
            await audit(
              c,
              user,
              "ANULACION",
              "CUENTACORRIENTE",
              creditId,
              { CajaMovimiento: id },
              input.Motivo,
            );
          await audit(
            c,
            user,
            "ANULACION",
            "CAJAMOVIMIENTO",
            id,
            {
              Antes: before,
              Despues: after,
              BancoAntes: bankBefore,
              BancoDespues: await cashBankMovements(c, id),
              ConfirmarCorreccionBancaria: input.ConfirmarCorreccionBancaria,
            },
            input.Motivo,
          );
          return after;
        },
      );
    },
    async reversalPreview(id: string): Promise<CashReversalPreview> {
      validId(id);
      const original = (await movementDetail(pool, id)).registro;
      if (
        original.Estado !== "CONFIRMADO" ||
        original.CajaMovimientoOrigen ||
        original.JornadaEstado !== "CERRADO"
      )
        fail(
          "Solo se pueden revertir movimientos vigentes de una jornada cerrada.",
        );
      const code = await reversalSetup(pool, id);
      const voucher = await reversalVoucher(
        pool,
        original,
        code,
        false,
        module,
      );
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM NUMERACION WHERE Comprobante=?",
        [code],
      );
      checkReversalNumerator(rows[0]);
      return {
        Comprobante: code,
        ComprobanteDescripcion: String(voucher.Descripcion),
        NumeroComprobante: String(rows[0]!.ProximoNumero),
      };
    },
    async reverse(
      id: string,
      input: z.infer<typeof reversal>,
      version: string,
      user: string,
      key: string,
    ) {
      validId(id);
      return tx(
        user,
        treasury ? "TESORERIA_REVERSAR" : "CAJA_REVERSAR",
        key,
        { id, ...input, version },
        async (c) => {
          const code = await reversalSetup(c, id);
          // El Numerador es obligatorio: su fila bloqueada serializa la asignación,
          // incluso entre distintos originales. Los reintentos se resuelven antes
          // de consultar configuración mutable, sin consumir otro número.
          const [numerators] = await c.execute<RowDataPacket[]>(
            "SELECT * FROM NUMERACION WHERE Comprobante=? FOR UPDATE",
            [code],
          );
          const n = numerators[0];
          checkReversalNumerator(n);
          const number = String(n!.ProximoNumero);
          await numberStart(c, code, number);
          const box = await opening(c, input.CajaSaldo);
          const [locked] = await c.execute<RowDataPacket[]>(
            "SELECT m.* FROM CAJAMOVIMIENTO m WHERE m.IDTabla=? FOR UPDATE",
            [id],
          );
          if (!locked[0]) fail("El movimiento no existe.", 404);
          const original = await movementDetail(c, id);
          if (
            original.version !== version ||
            original.registro.RevertidoPor ||
            original.registro.CajaMovimientoOrigen ||
            original.registro.Estado !== "CONFIRMADO"
          )
            fail("El movimiento cambió o ya tiene una reversión.");
          const r = original.registro;
          const [source] = await c.execute<RowDataPacket[]>(
            "SELECT Estado FROM CAJASALDO WHERE IDTabla=? FOR UPDATE",
            [r.CajaSaldo],
          );
          if (source[0]?.Estado !== "CERRADO")
            fail(
              "La jornada original debe estar cerrada para revertir. Si continúa abierta, seleccioná esa jornada y utilizá Anular.",
            );
          const sense = r.Sentido === "INGRESO" ? "EGRESO" : "INGRESO";
          await reversalVoucher(c, r, code, true, module);
          if (treasury) ensureInternalCash(original);
          else {
            const [credits] = await c.execute<RowDataPacket[]>(
              "SELECT IDTabla FROM CUENTACORRIENTE WHERE CajaMovimiento=? FOR UPDATE",
              [id],
            );
            if (!credits[0])
              fail("Falta el movimiento de Cuenta corriente relacionado.");
            if ((await used(c, String(credits[0].IDTabla))) > 0n)
              fail("El crédito generado tiene aplicaciones posteriores.");
            const originalApplied = original.afectaciones.reduce(
              (s, a) => s + moneyUnits(a.Importe),
              0n,
            );
            if (
              originalApplied !==
              moneyUnits(r.ImporteTotal) - moneyUnits(r.ImporteACuenta)
            )
              fail(
                "La operación tiene aplicaciones posteriores y requiere revisar su reversión.",
              );
          }
          checkCashBalance(
            await cashBalance(c, box),
            (sense === "INGRESO" ? 1n : -1n) * moneyUnits(r.ImporteEfectivo),
          );
          const [events] = await c.execute<RowDataPacket[]>(
            "SELECT * FROM CHEQUEEVENTO WHERE CajaMovimiento=? ORDER BY Cheque FOR UPDATE",
            [id],
          );
          for (const e of events) {
            const [ch] = await c.execute<RowDataPacket[]>(
              "SELECT IDTabla FROM CHEQUE WHERE IDTabla=? FOR UPDATE",
              [String(e.Cheque)],
            );
            if (!ch[0]) fail("Falta el cheque relacionado.");
            const [later] = await c.execute<RowDataPacket[]>(
              "SELECT IDTabla FROM CHEQUEEVENTO WHERE Cheque=? AND IDTabla>? LIMIT 1",
              [String(e.Cheque), String(e.IDTabla)],
            );
            if (later.length)
              fail(
                "Un cheque tiene eventos posteriores. Deben resolverse antes de revertir la operación.",
              );
          }
          const date = today(),
            now = new Date();
          await c.execute(
            "INSERT INTO CAJAMOVIMIENTO (CajaMovimientoOrigen,Comprobante,NumeroComprobante,Cliente,FechaOrigen,CajaSaldo,Concepto,ImporteEfectivo,ImporteACuenta,ImporteTotal,Sentido,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,'CONFIRMADO',?,?)",
            [
              id,
              code,
              number,
              r.Cliente,
              date,
              input.CajaSaldo,
              r.Concepto,
              r.ImporteEfectivo,
              r.ImporteTotal,
              sense,
              input.Motivo,
              user,
              now,
            ],
          );
          const reverseId = await lastId(c);
          let debtId: string | null = null;
          if (!treasury) {
            await c.execute(
              "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,CajaMovimiento,NumeroComprobante,FechaOrigen,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,'DEUDA',?,?,'CONFIRMADO',?,?)",
              [
                r.Cliente,
                code,
                reverseId,
                number,
                date,
                r.Cuenta,
                r.ImporteTotal,
                input.Motivo,
                user,
                now,
              ],
            );
            debtId = await lastId(c);
            // El anticipo original absorbe esa parte de la contradeuda; la nueva deuda
            // pendiente recupera solo lo cancelado. Las afectaciones anteriores se conservan.
            if (moneyUnits(r.ImporteACuenta) > 0n)
              await c.execute(
                "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe,CreadoEn,Usuario) VALUES (?,?,?,?,?)",
                [id, debtId, r.ImporteACuenta, now, user],
              );
          }
          const [transfers] = await c.execute<RowDataPacket[]>(
            "SELECT * FROM TRANSFERENCIA WHERE CajaMovimiento=?",
            [id],
          );
          for (const t of transfers)
            await saveTransfer(
              c,
              code,
              reverseId,
              date,
              String(t.BancoCuenta),
              String(t.Importe),
              "Reversión de " + r.NumeroComprobanteTexto,
              sense,
              user,
            );
          for (const e of events) {
            const state =
              e.Tipo === "RECEPCION"
                ? "DEVUELTO"
                : e.Tipo === "EMISION"
                  ? "ANULADO"
                  : "CARTERA";
            const event =
              e.Tipo === "RECEPCION"
                ? "DEVOLUCION"
                : e.Tipo === "EMISION"
                  ? "ANULACION"
                  : "RECUPERACION";
            await c.execute("UPDATE CHEQUE SET Estado=? WHERE IDTabla=?", [
              state,
              String(e.Cheque),
            ]);
            await c.execute(
              "INSERT INTO CHEQUEEVENTO (Cheque,Tipo,Fecha,CajaMovimiento,Usuario,CreadoEn,Observacion) VALUES (?,?,?,?,?,?,?)",
              [
                String(e.Cheque),
                event,
                date,
                reverseId,
                user,
                now,
                input.Motivo,
              ],
            );
            await audit(
              c,
              user,
              event,
              "CHEQUE",
              String(e.Cheque),
              { CajaMovimiento: reverseId },
              input.Motivo,
            );
          }
          await numberFinish(c, code, number, n);
          await audit(
            c,
            user,
            "REVERSIÓN",
            "CAJAMOVIMIENTO",
            reverseId,
            { CajaMovimientoOrigen: id },
            input.Motivo,
          );
          if (debtId)
            await audit(
              c,
              user,
              "ALTA_DESDE_REVERSIÓN",
              "CUENTACORRIENTE",
              debtId,
              { CajaMovimiento: reverseId },
            );
          return movementDetail(c, reverseId);
        },
      );
    },
  };
}
export type CashMovementStore = ReturnType<typeof createCashMovementStore>;
