import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  thirdPartyChequeStates,
  type ThirdPartyChequeEvent,
  type ThirdPartyChequeReport,
  type ThirdPartyChequeRow,
} from "@erp/shared";
import { listOrder, optionOrder } from "../database/list-order.js";
import { MasterRequestError } from "../masters/validation.js";
import { reportMovement } from "./policy.js";
import type { ChequeReportQuery } from "./validation.js";

// Las relaciones a eventos eligen una sola fila: nunca multiplican el importe
// del instrumento por sus endosos, recuperaciones o aplicaciones comerciales.
const source = `FROM CHEQUE ch JOIN BANCO b ON b.Codigo=ch.Banco
 LEFT JOIN CHEQUEEVENTO reception ON reception.IDTabla=(SELECT MIN(e.IDTabla) FROM CHEQUEEVENTO e WHERE e.Cheque=ch.IDTabla AND e.Tipo='RECEPCION' AND e.CajaMovimiento IS NOT NULL)
 LEFT JOIN CAJAMOVIMIENTO m ON m.IDTabla=reception.CajaMovimiento
 LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente
 LEFT JOIN COMPROBANTE v ON v.Codigo=m.Comprobante
 LEFT JOIN CHEQUEEVENTO deposit ON deposit.IDTabla=(SELECT MAX(e.IDTabla) FROM CHEQUEEVENTO e LEFT JOIN CAJAMOVIMIENTO dm ON dm.IDTabla=e.CajaMovimiento WHERE e.Cheque=ch.IDTabla AND e.Tipo='DEPOSITO' AND (e.CajaMovimiento IS NULL OR ${reportMovement("dm")}))
 LEFT JOIN BANCOCUENTA bc ON bc.Codigo=COALESCE(deposit.BancoCuenta,ch.BancoCuenta)`;
const valid = `ch.Tipo='TERCERO' AND ${reportMovement("ch")} AND ch.Estado<>'RECEPCION_ANULADA'
 AND (reception.IDTabla IS NULL OR ${reportMovement("m")})`;
const projection = `ch.IDTabla AS Clave,ch.Numero,DATE_FORMAT(ch.Emision,'%Y-%m-%d') AS Emision,
 DATE_FORMAT(ch.Vencimiento,'%Y-%m-%d') AS Vencimiento,ch.Importe,ch.Estado,b.Codigo AS Banco,b.Nombre AS BancoNombre,
 bc.Codigo AS BancoCuenta,bc.Nombre AS CuentaNombre,cl.Codigo AS Cliente,cl.Nombre AS ClienteNombre,
 ch.Librador,ch.CuentaLibradora,v.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante`;
function row(r: RowDataPacket): ThirdPartyChequeRow {
  const { ComprobanteDescripcion, NumeroComprobante, ...fields } = r;
  return {
    ...Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v == null ? null : String(v)]),
    ),
    Operacion:
      NumeroComprobante == null
        ? null
        : `${ComprobanteDescripcion} · ${formatVoucher(String(NumeroComprobante))}`,
  } as unknown as ThirdPartyChequeRow;
}
async function snapshot<T>(
  pool: Pool,
  work: (c: PoolConnection) => Promise<T>,
) {
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION READ ONLY");
    const result = await work(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function thirdPartyCheques(
  pool: Pool,
  q: ChequeReportQuery,
): Promise<ThirdPartyChequeReport> {
  const clauses = [valid],
    params: string[] = [];
  for (const [key, field] of [
    ["Banco", "b.Codigo"],
    ["Cliente", "cl.Codigo"],
  ] as const) {
    if (q[key]) {
      clauses.push(`${field}=?`);
      params.push(q[key]!);
    }
  }
  if (q.Estado !== "TODOS") {
    clauses.push("ch.Estado=?");
    params.push(q.Estado);
  }
  const date = q.FechaPor === "VENCIMIENTO" ? "ch.Vencimiento" : "ch.Emision";
  if (q.Desde) {
    clauses.push(`${date}>=?`);
    params.push(q.Desde);
  }
  if (q.Hasta) {
    clauses.push(`${date}<=?`);
    params.push(q.Hasta);
  }
  if (q.q) {
    const fields = [
      "ch.Numero",
      "ch.Librador",
      "ch.CuentaLibradora",
      "b.Nombre",
      "bc.Nombre",
      "cl.Codigo",
      "cl.Nombre",
    ];
    clauses.push(
      "(" + fields.map((f) => `${f} LIKE ? ESCAPE '!'`).join(" OR ") + ")",
    );
    params.push(...fields.map(() => "%" + q.q.replace(/[!%_]/g, "!$&") + "%"));
  }
  const from = `${source} WHERE ${clauses.join(" AND ")}`;
  const stateOrder = optionOrder("ch.Estado", thirdPartyChequeStates);
  const order = listOrder(
    q,
    {
      Numero: "LPAD(TRIM(LEADING '0' FROM ch.Numero),30,'0')",
      Emision: "ch.Emision",
      Vencimiento: "ch.Vencimiento",
      Importe: "ch.Importe",
      Estado: stateOrder,
      BancoNombre: "b.Nombre",
      ClienteNombre: "cl.Nombre",
      CuentaNombre: "bc.Nombre",
    },
    "ch.IDTabla",
  );
  return snapshot(pool, async (c) => {
    const [totals] = await c.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cantidad,COALESCE(SUM(ch.Importe),0) AS Importe ${from}`,
      params,
    );
    const [groups] = await c.execute<RowDataPacket[]>(
      `SELECT ch.Estado,COUNT(*) AS Cantidad,SUM(ch.Importe) AS Importe ${from} GROUP BY ch.Estado ORDER BY ${stateOrder}`,
      params,
    );
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT ${projection} ${from} ORDER BY ${stateOrder} ${q.orden === "Estado" && q.direccion === "desc" ? "DESC" : "ASC"},${order}${q.continuo ? "" : " LIMIT ? OFFSET ?"}`,
      [...params, ...(q.continuo ? [] : [q.limite, (q.pagina - 1) * q.limite])],
    );
    const total = Number(totals[0]!.Cantidad);
    return {
      registros: rows.map(row),
      total,
      pagina: q.continuo ? 1 : q.pagina,
      limite: q.continuo ? Math.max(1, total) : q.limite,
      consultadoEn: new Date().toISOString(),
      totales: { Cantidad: total, Importe: String(totals[0]!.Importe) },
      subtotales: groups.map((g) => ({
        Estado: String(g.Estado),
        Cantidad: Number(g.Cantidad),
        Importe: String(g.Importe),
      })),
    };
  });
}
export async function thirdPartyChequeDetail(
  pool: Pool,
  id: string,
): Promise<ThirdPartyChequeRow> {
  return snapshot(pool, async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT ${projection} ${source} WHERE ${valid} AND ch.IDTabla=?`,
      [id],
    );
    if (!rows[0])
      throw new MasterRequestError(
        404,
        "El cheque no está disponible en este informe. Actualizá la consulta.",
      );
    const [events] = await c.execute<RowDataPacket[]>(
      `SELECT e.IDTabla AS Clave,e.Tipo,DATE_FORMAT(e.Fecha,'%Y-%m-%d') AS Fecha,u.Nombre AS UsuarioNombre,
      bc.Nombre AS CuentaNombre,v.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante,
      CASE WHEN EXISTS(SELECT 1 FROM CAJAMOVIMIENTO r WHERE r.CajaMovimientoOrigen=m.IDTabla AND r.Estado='CONFIRMADO') THEN 'REVERTIDO' ELSE m.Estado END AS EstadoOperacion,
      e.Observacion,bm.Sentido AS SentidoBancario,bm.Importe AS ImporteBancario
      FROM CHEQUEEVENTO e JOIN USUARIO u ON u.IDTabla=e.Usuario LEFT JOIN BANCOCUENTA bc ON bc.Codigo=e.BancoCuenta
      LEFT JOIN CAJAMOVIMIENTO m ON m.IDTabla=e.CajaMovimiento LEFT JOIN COMPROBANTE v ON v.Codigo=m.Comprobante
      LEFT JOIN BANCOMOVIMIENTO bm ON bm.ChequeEvento=e.IDTabla
      WHERE e.Cheque=? AND (e.CajaMovimiento IS NULL OR ${reportMovement("m")}) ORDER BY e.IDTabla`,
      [id],
    );
    return {
      ...row(rows[0]),
      Historial: events.map((e) => row(e) as unknown as ThirdPartyChequeEvent),
    };
  });
}
