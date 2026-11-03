import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  type CashJourneyReport,
  type CashJourneyRow,
  type CashJourneyOption,
} from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
import { treasuryMovement } from "../database/cash-scope.js";
import { reportMovement } from "./policy.js";
import { dailyCash } from "./cash.js";
import { cashReportQuery, type CashJourneyQuery } from "./validation.js";

export async function cashJourneys(
  pool: Pool,
  box: string,
): Promise<{ registros: CashJourneyOption[] }> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT cs.IDTabla AS Clave,ca.Codigo AS Caja,ca.Nombre AS CajaNombre,cs.AperturaEn,cs.CierreEn,cs.Estado
    FROM CAJASALDO cs JOIN CAJA ca ON ca.Codigo=cs.Caja WHERE cs.Caja=? AND cs.Estado IN ('ABIERTO','CERRADO') ORDER BY cs.AperturaEn DESC,cs.IDTabla DESC`,
    [box],
  );
  return {
    registros: rows.map(
      (r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            k,
            v instanceof Date ? v.toISOString() : v == null ? null : String(v),
          ]),
        ) as unknown as CashJourneyOption,
    ),
  };
}
/** La apertura, sus flujos y el detalle se leen en el mismo snapshot. Ningún
 * campo de cierre ni movimiento se modifica al consultar o volver a emitir. */
export async function cashJourney(
  pool: Pool,
  q: CashJourneyQuery,
): Promise<CashJourneyReport> {
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION READ ONLY");
    const summary = await dailyCash(
      pool,
      cashReportQuery.parse({
        continuo: "1",
        ...(q.Caja ? { Caja: q.Caja } : {}),
      }),
      { connection: c, openingId: q.CajaSaldo },
    );
    const opening = summary.registros[0];
    if (!opening)
      throw new MasterRequestError(
        404,
        "La jornada no existe o no pertenece a la caja seleccionada.",
      );
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT m.IDTabla AS Clave,DATE_FORMAT(m.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,m.CreadoEn AS RegistradoEn,
      v.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante,cl.Nombre AS ClienteNombre,co.Descripcion AS ConceptoDescripcion,
      CONCAT_WS(' · ',cl.Nombre,co.Descripcion,NULLIF(m.Observacion,'')) AS Detalle,u.Nombre AS UsuarioNombre,
      CASE WHEN ${treasuryMovement("m")} THEN 'TESORERIA' ELSE 'COBROSPAGOS' END AS Modulo,
      CASE WHEN EXISTS(SELECT 1 FROM CAJAMOVIMIENTO r WHERE r.CajaMovimientoOrigen=m.IDTabla AND r.Estado='CONFIRMADO') THEN 'REVERTIDO' ELSE m.Estado END AS Estado,
      (m.CajaMovimientoOrigen IS NOT NULL) AS EsReverso,ov.Descripcion AS OriginalDescripcion,original.NumeroComprobante AS OriginalNumero,
      m.ImporteTotal,CASE WHEN m.Sentido='INGRESO' THEN m.ImporteEfectivo ELSE 0 END AS IngresoEfectivo,
      CASE WHEN m.Sentido='EGRESO' THEN m.ImporteEfectivo ELSE 0 END AS EgresoEfectivo,
      CASE WHEN m.Sentido='INGRESO' THEN m.ImporteTotal-m.ImporteEfectivo ELSE -(m.ImporteTotal-m.ImporteEfectivo) END AS OtrosMediosNeto,
      cs.SaldoInicial+SUM(CASE WHEN m.Sentido='INGRESO' THEN m.ImporteEfectivo ELSE -m.ImporteEfectivo END) OVER (ORDER BY m.CreadoEn,m.IDTabla ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS SaldoAcumulado
      FROM CAJAMOVIMIENTO m JOIN CAJASALDO cs ON cs.IDTabla=m.CajaSaldo JOIN COMPROBANTE v ON v.Codigo=m.Comprobante
      JOIN USUARIO u ON u.IDTabla=m.Usuario LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente LEFT JOIN CONCEPTO co ON co.Codigo=m.Concepto
      LEFT JOIN CAJAMOVIMIENTO original ON original.IDTabla=m.CajaMovimientoOrigen LEFT JOIN COMPROBANTE ov ON ov.Codigo=original.Comprobante
      WHERE m.CajaSaldo=? AND ${reportMovement("m")} AND m.Sentido IN ('INGRESO','EGRESO') ORDER BY m.CreadoEn,m.IDTabla`,
      [q.CajaSaldo],
    );
    // La resta monetaria adicional también es DECIMAL SQL, no Number en JS.
    const [other] = await c.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(CASE WHEN Sentido='INGRESO' THEN ImporteTotal-ImporteEfectivo ELSE -(ImporteTotal-ImporteEfectivo) END),0) AS Neto
      FROM CAJAMOVIMIENTO m WHERE m.CajaSaldo=? AND ${reportMovement("m")} AND m.Sentido IN ('INGRESO','EGRESO')`,
      [q.CajaSaldo],
    );
    await c.commit();
    return {
      registros: rows.map((r) => {
        const {
          NumeroComprobante,
          OriginalDescripcion,
          OriginalNumero,
          ...values
        } = r;
        return {
          ...Object.fromEntries(
            Object.entries(values).map(([k, v]) => [
              k,
              v instanceof Date
                ? v.toISOString()
                : v == null
                  ? null
                  : String(v),
            ]),
          ),
          EsReverso: Number(r.EsReverso) === 1,
          NumeroComprobanteTexto: formatVoucher(String(NumeroComprobante)),
          Original:
            OriginalNumero == null
              ? null
              : `${OriginalDescripcion} · ${formatVoucher(String(OriginalNumero))}`,
        } as unknown as CashJourneyRow;
      }),
      total: rows.length,
      consultadoEn: summary.consultadoEn,
      jornada: opening,
      totales: {
        IngresoEfectivo: opening.IngresosEfectivo,
        EgresoEfectivo: opening.EgresosEfectivo,
        OtrosMediosNeto: String(other[0]!.Neto),
        SaldoAcumulado: opening.TeoricoCalculado!,
      },
    };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
