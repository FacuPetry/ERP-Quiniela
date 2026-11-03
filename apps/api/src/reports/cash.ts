import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  DailyCashReport,
  DailyCashRow,
  DailyCashTotals,
} from "@erp/shared";
import { treasuryMovement } from "../database/cash-scope.js";
import { listOrder } from "../database/list-order.js";
import { reportMovement } from "./policy.js";
import type { CashReportQuery } from "./validation.js";

const zone = new Intl.DateTimeFormat("en", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const civil = (instant: number) => {
  const parts = zone.formatToParts(new Date(instant));
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year").padStart(4, "0")}-${value("month")}-${value("day")}`;
};
/** Primer instante del día civil del negocio; no depende del TZ del host ni
 * de tablas de zonas horarias de MySQL. BA está dentro de ±12 h de UTC. */
function dayStart(day: string) {
  const utc = Date.parse(day + "T00:00:00Z");
  let low = utc - 43200000,
    high = utc + 43200000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (civil(mid) < day) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}
const monetaryFlows = [
  "IngresosEfectivo",
  "EgresosEfectivo",
  "IngresosComerciales",
  "EgresosComerciales",
  "IngresosTesoreria",
  "EgresosTesoreria",
  "IngresosOtrosMedios",
  "EgresosOtrosMedios",
] as const;

function readTotals(t: RowDataPacket): DailyCashTotals {
  return {
    ...(Object.fromEntries(
      monetaryFlows.map((k) => [k, String(t[k])]),
    ) as Record<(typeof monetaryFlows)[number], string>),
    Diferencia: t.Diferencia == null ? null : String(t.Diferencia),
    Movimientos: Number(t.Movimientos),
    Abiertas: Number(t.Abiertas),
    Cerradas: Number(t.Cerradas),
  };
}

export async function dailyCash(
  pool: Pool,
  q: CashReportQuery,
  scope?: { connection: PoolConnection; openingId: string },
): Promise<DailyCashReport> {
  const where = ["cs.Estado IN ('ABIERTO','CERRADO')"];
  const params: (string | Date)[] = [];
  if (scope) {
    where.push("cs.IDTabla=?");
    params.push(scope.openingId);
  }
  if (q.Caja) {
    where.push("cs.Caja=?");
    params.push(q.Caja);
  }
  if (q.Estado !== "TODOS") {
    where.push("cs.Estado=?");
    params.push(q.Estado);
  }
  if (q.Desde) {
    where.push("cs.AperturaEn>=?");
    params.push(dayStart(q.Desde));
  }
  if (q.Hasta && q.Hasta !== "9999-12-31") {
    const next = new Date(q.Hasta + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    where.push("cs.AperturaEn<?");
    params.push(dayStart(next.toISOString().slice(0, 10)));
  }
  // Solo CAJAMOVIMIENTO antes de agrupar: afectaciones/eventos/valores no se unen.
  // La clasificación comercial/Tesorería es la misma del servicio operativo.
  const grouped = `SELECT m.CajaSaldo,COUNT(*) AS Movimientos,
    SUM(CASE WHEN m.Sentido='INGRESO' THEN m.ImporteEfectivo ELSE 0 END) AS IngresosEfectivo,
    SUM(CASE WHEN m.Sentido='EGRESO' THEN m.ImporteEfectivo ELSE 0 END) AS EgresosEfectivo,
    SUM(CASE WHEN m.Sentido='INGRESO' AND m.EsTesoreria=0 THEN m.ImporteEfectivo ELSE 0 END) AS IngresosComerciales,
    SUM(CASE WHEN m.Sentido='EGRESO' AND m.EsTesoreria=0 THEN m.ImporteEfectivo ELSE 0 END) AS EgresosComerciales,
    SUM(CASE WHEN m.Sentido='INGRESO' AND m.EsTesoreria=1 THEN m.ImporteEfectivo ELSE 0 END) AS IngresosTesoreria,
    SUM(CASE WHEN m.Sentido='EGRESO' AND m.EsTesoreria=1 THEN m.ImporteEfectivo ELSE 0 END) AS EgresosTesoreria,
    SUM(CASE WHEN m.Sentido='INGRESO' THEN m.ImporteTotal-m.ImporteEfectivo ELSE 0 END) AS IngresosOtrosMedios,
    SUM(CASE WHEN m.Sentido='EGRESO' THEN m.ImporteTotal-m.ImporteEfectivo ELSE 0 END) AS EgresosOtrosMedios
    FROM (SELECT m.*,(${treasuryMovement("m")}) AS EsTesoreria FROM CAJAMOVIMIENTO m
      WHERE ${reportMovement("m")} AND m.Sentido IN ('INGRESO','EGRESO')${scope ? " AND m.CajaSaldo=?" : ""}) m GROUP BY m.CajaSaldo`;
  const projected = `SELECT cs.IDTabla AS Clave,ca.Codigo AS Caja,ca.Nombre AS CajaNombre,cs.AperturaEn,cs.CierreEn,cs.Estado,
    ua.Nombre AS UsuarioAperturaNombre,uc.Nombre AS UsuarioCierreNombre,cs.Observacion,cs.SaldoInicial,
    ${monetaryFlows.map((k) => `COALESCE(f.${k},0) AS ${k}`).join(",")},
    COALESCE(f.Movimientos,0) AS Movimientos,
    cs.SaldoInicial+COALESCE(f.IngresosEfectivo,0)-COALESCE(f.EgresosEfectivo,0) AS TeoricoCalculado,
    CASE WHEN cs.Estado='CERRADO' THEN cs.SaldoTeorico ELSE cs.SaldoInicial+COALESCE(f.IngresosEfectivo,0)-COALESCE(f.EgresosEfectivo,0) END AS Teorico,
    CASE WHEN cs.Estado='CERRADO' THEN cs.SaldoContado ELSE NULL END AS SaldoContado,
    CASE WHEN cs.Estado='CERRADO' THEN cs.SaldoContado-cs.SaldoTeorico ELSE NULL END AS Diferencia,
    CASE WHEN cs.Estado='CERRADO' THEN (cs.SaldoTeorico=cs.SaldoInicial+COALESCE(f.IngresosEfectivo,0)-COALESCE(f.EgresosEfectivo,0)) ELSE NULL END AS CierreCoincide
    FROM CAJASALDO cs JOIN CAJA ca ON ca.Codigo=cs.Caja
    JOIN USUARIO ua ON ua.IDTabla=cs.UsuarioApertura LEFT JOIN USUARIO uc ON uc.IDTabla=cs.UsuarioCierre
    LEFT JOIN (${grouped}) f ON f.CajaSaldo=cs.IDTabla WHERE ${where.join(" AND ")}`;
  const order = listOrder(
    q,
    {
      CajaNombre: "s.CajaNombre",
      AperturaEn: "s.AperturaEn",
      CierreEn: "s.CierreEn",
      Estado: "s.Estado",
      SaldoInicial: "s.SaldoInicial",
      IngresosEfectivo: "s.IngresosEfectivo",
      EgresosEfectivo: "s.EgresosEfectivo",
      Teorico: "s.Teorico",
      SaldoContado: "s.SaldoContado",
      Diferencia: "s.Diferencia",
    },
    "s.Clave",
  );
  // Los grupos permanecen contiguos; ordenar otra columna cambia el orden
  // dentro de cada Caja. CajaNombre permite invertir el orden de los grupos.
  const groupedOrder = `s.CajaNombre ${q.orden === "CajaNombre" && q.direccion === "desc" ? "DESC" : "ASC"},s.Caja ASC,${order}`;
  const aggregate = `COUNT(*) AS total,
      ${monetaryFlows.map((k) => `COALESCE(SUM(s.${k}),0) AS ${k}`).join(",")},
      COALESCE(SUM(s.Movimientos),0) AS Movimientos,COALESCE(SUM(s.Estado='ABIERTO'),0) AS Abiertas,COALESCE(SUM(s.Estado='CERRADO'),0) AS Cerradas,
      CASE WHEN SUM(s.Estado='CERRADO')>0 AND SUM(s.Estado='CERRADO' AND s.Diferencia IS NULL)=0 THEN SUM(s.Diferencia) ELSE NULL END AS Diferencia`;
  // El detalle de una apertura no necesita agregar las demás jornadas.
  const queryParams = scope ? [scope.openingId, ...params] : params;
  const c = scope?.connection ?? (await pool.getConnection());
  try {
    if (!scope) {
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await c.query("START TRANSACTION READ ONLY");
    }
    const [totals] = await c.execute<RowDataPacket[]>(
      `SELECT ${aggregate} FROM (${projected}) s`,
      queryParams,
    );
    const [groups] = await c.execute<RowDataPacket[]>(
      `SELECT s.Caja,s.CajaNombre,${aggregate} FROM (${projected}) s GROUP BY s.Caja,s.CajaNombre ORDER BY s.CajaNombre,s.Caja`,
      queryParams,
    );
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT s.* FROM (${projected}) s ORDER BY ${groupedOrder}${q.continuo ? "" : " LIMIT ? OFFSET ?"}`,
      [
        ...queryParams,
        ...(q.continuo ? [] : [q.limite, (q.pagina - 1) * q.limite]),
      ],
    );
    if (!scope) await c.commit();
    const t = totals[0]!;
    return {
      registros: rows.map(
        (r) =>
          Object.fromEntries(
            Object.entries(r).map(([key, value]) => [
              key,
              value == null
                ? null
                : key === "Movimientos"
                  ? Number(value)
                  : key === "CierreCoincide"
                    ? Number(value) === 1
                    : value instanceof Date
                      ? value.toISOString()
                      : String(value),
            ]),
          ) as unknown as DailyCashRow,
      ),
      total: Number(t.total),
      pagina: q.continuo ? 1 : q.pagina,
      limite: q.continuo ? Math.max(1, Number(t.total)) : q.limite,
      consultadoEn: new Date().toISOString(),
      totales: readTotals(t),
      subtotales: groups.map((g) => ({
        ...readTotals(g),
        Caja: String(g.Caja),
        CajaNombre: String(g.CajaNombre),
        Jornadas: Number(g.total),
      })),
    };
  } catch (e) {
    if (!scope) await c.rollback();
    throw e;
  } finally {
    if (!scope) c.release();
  }
}
