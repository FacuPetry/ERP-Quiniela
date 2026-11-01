import type { Pool, RowDataPacket } from "mysql2/promise";
import type { AccountSummary, AccountSummaryRow } from "@erp/shared";
import { listOrder } from "../database/list-order.js";
import type { SummaryQuery } from "./validation.js";

export function createReportStore(pool: Pool) {
  return {
    async accountSummary(q: SummaryQuery): Promise<AccountSummary> {
      const order = listOrder(
        q,
        {
          Cliente: "s.Cliente",
          ClienteNombre: "s.ClienteNombre",
          SaldoCobrar: "s.SaldoCobrar",
          SaldoPagar: "s.SaldoPagar",
          SaldoNeto: "(s.SaldoCobrar-s.SaldoPagar)",
        },
        "s.Cliente",
      );
      const params: string[] = [],
        filters: string[] = [
          "a.Estado='CONFIRMADO'",
          "a.Cuenta IN ('COBRAR','PAGAR')",
          "a.Naturaleza IN ('DEUDA','CREDITO')",
        ];
      if (q.Cliente) {
        filters.push("a.Cliente=?");
        params.push(q.Cliente);
      }
      if (q.q) {
        filters.push(
          "(cl.Codigo LIKE ? ESCAPE '!' OR cl.Nombre LIKE ? ESCAPE '!')",
        );
        params.push(
          ...Array<string>(2).fill("%" + q.q.replace(/[!%_]/g, "!$&") + "%"),
        );
      }
      // El crédito interno de cada cobro/pago ya reduce el saldo. Las afectaciones
      // se usan SOLO para el pendiente documental, nunca para restar otra vez.
      const grouped = `SELECT a.Cliente,cl.Nombre AS ClienteNombre,
        SUM(CASE WHEN a.Cuenta='COBRAR' THEN CASE WHEN a.Naturaleza='DEUDA' THEN a.Importe ELSE -a.Importe END ELSE 0 END) AS SaldoCobrar,
        SUM(CASE WHEN a.Cuenta='PAGAR' THEN CASE WHEN a.Naturaleza='DEUDA' THEN a.Importe ELSE -a.Importe END ELSE 0 END) AS SaldoPagar,
        SUM(CASE WHEN a.Cuenta='COBRAR' AND a.Naturaleza='DEUDA' THEN a.Importe-COALESCE(x.Aplicado,0) ELSE 0 END) AS PendienteCobrar,
        SUM(CASE WHEN a.Cuenta='PAGAR' AND a.Naturaleza='DEUDA' THEN a.Importe-COALESCE(x.Aplicado,0) ELSE 0 END) AS PendientePagar
        FROM CUENTACORRIENTE a JOIN CLIENTE cl ON cl.Codigo=a.Cliente
        LEFT JOIN (SELECT f.CuentaCorriente,SUM(f.Importe) AS Aplicado FROM CAJAMOVIMIENTOAFECTACION f
          JOIN CAJAMOVIMIENTO m ON m.IDTabla=f.CajaMovimiento WHERE m.Estado='CONFIRMADO' GROUP BY f.CuentaCorriente) x ON x.CuentaCorriente=a.IDTabla
        WHERE ${filters.join(" AND ")} GROUP BY a.Cliente,cl.Nombre`;
      const c = await pool.getConnection();
      try {
        await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await c.query("START TRANSACTION READ ONLY");
        const [totals] = await c.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS total,COALESCE(SUM(s.SaldoCobrar),0) AS SaldoCobrar,COALESCE(SUM(s.SaldoPagar),0) AS SaldoPagar,COALESCE(SUM(s.SaldoCobrar-s.SaldoPagar),0) AS SaldoNeto FROM (${grouped}) s`,
          params,
        );
        const [rows] = await c.execute<RowDataPacket[]>(
          `SELECT s.*,s.SaldoCobrar-s.SaldoPagar AS SaldoNeto,
          s.PendienteCobrar-s.SaldoCobrar AS CreditoSinAplicarCobrar,s.PendientePagar-s.SaldoPagar AS CreditoSinAplicarPagar
          FROM (${grouped}) s ORDER BY ${order} LIMIT ? OFFSET ?`,
          [...params, q.limite, (q.pagina - 1) * q.limite],
        );
        await c.commit();
        const t = totals[0]!;
        return {
          registros: rows.map(
            (r) =>
              Object.fromEntries(
                Object.entries(r).map(([k, v]) => [k, String(v)]),
              ) as unknown as AccountSummaryRow,
          ),
          total: Number(t.total),
          pagina: q.pagina,
          limite: q.limite,
          consultadoEn: new Date().toISOString(),
          totales: {
            SaldoCobrar: String(t.SaldoCobrar),
            SaldoPagar: String(t.SaldoPagar),
            SaldoNeto: String(t.SaldoNeto),
          },
        };
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
export type ReportStore = ReturnType<typeof createReportStore>;
