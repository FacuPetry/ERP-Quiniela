import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  type AccountLedger,
  type AccountLedgerAllocation,
  type AccountLedgerRow,
  type AccountLedgerValue,
} from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
import type { LedgerQuery } from "./validation.js";
import { reportMovement } from "./policy.js";
const operation = (description: unknown, number: unknown) =>
  description
    ? `${String(description)} · ${formatVoucher(number == null ? null : String(number))}`
    : null;
const placeholders = (values: readonly string[]) =>
  values.map(() => "?").join(",");
const isDebit =
  "((a.Cuenta='COBRAR' AND a.Naturaleza='DEUDA') OR (a.Cuenta='PAGAR' AND a.Naturaleza='CREDITO'))";
// Una fila por asiento de Cuenta corriente. No unir afectaciones ni valores aquí:
// esas relaciones 1:N multiplicarían los importes y el saldo de la ventana.
const base = `SELECT a.IDTabla AS Clave,a.FechaOrigen AS FechaOrden,
 DATE_FORMAT(a.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,a.NumeroComprobante,
 vc.Descripcion AS ComprobanteDescripcion,co.Descripcion AS Concepto,a.Observacion,
 a.Cuenta,a.Naturaleza,a.Importe AS ImporteOriginal,a.CajaMovimiento,
 CASE WHEN a.Estado='ANULADO' THEN 'ANULADO' WHEN rev.IDTabla IS NOT NULL THEN 'REVERTIDO' ELSE a.Estado END AS Estado,
 (cm.CajaMovimientoOrigen IS NOT NULL) AS EsReverso,
 CASE WHEN ${isDebit} THEN a.Importe ELSE 0 END AS Debito,
 CASE WHEN NOT ${isDebit} THEN a.Importe ELSE 0 END AS Credito,
 CASE WHEN a.Cuenta='COBRAR' THEN CASE WHEN a.Naturaleza='DEUDA' THEN a.Importe ELSE -a.Importe END ELSE 0 END AS DeltaCobrar,
 CASE WHEN a.Cuenta='PAGAR' THEN CASE WHEN a.Naturaleza='DEUDA' THEN a.Importe ELSE -a.Importe END ELSE 0 END AS DeltaPagar,
 cm.NumeroComprobante AS OperacionNumero,cv.Descripcion AS OperacionDescripcion,
 src.NumeroComprobante AS OriginalNumero,sv.Descripcion AS OriginalDescripcion,
 rev.NumeroComprobante AS ReversionNumero,rv.Descripcion AS ReversionDescripcion,
 a.MotivoAnulacion,DATE_FORMAT(a.AnuladoEn,'%Y-%m-%dT%H:%i:%sZ') AS AnuladoEn,ch.Numero AS ChequeNumero,
 (SELECT first_e.CajaMovimiento FROM CHEQUEEVENTO first_e WHERE first_e.Cheque=ch.IDTabla AND first_e.Tipo='RECEPCION' ORDER BY first_e.IDTabla LIMIT 1) AS ChequeOrigen
 FROM CUENTACORRIENTE a JOIN COMPROBANTE vc ON vc.Codigo=a.Comprobante
 LEFT JOIN CAJAMOVIMIENTO cm ON cm.IDTabla=a.CajaMovimiento
 LEFT JOIN COMPROBANTE cv ON cv.Codigo=cm.Comprobante
 LEFT JOIN CONCEPTO co ON co.Codigo=COALESCE(a.Concepto,cm.Concepto)
 LEFT JOIN CAJAMOVIMIENTO src ON src.IDTabla=cm.CajaMovimientoOrigen
 LEFT JOIN COMPROBANTE sv ON sv.Codigo=src.Comprobante
 LEFT JOIN CAJAMOVIMIENTO rev ON rev.CajaMovimientoOrigen=cm.IDTabla AND rev.Estado='CONFIRMADO'
 LEFT JOIN COMPROBANTE rv ON rv.Codigo=rev.Comprobante
 LEFT JOIN CHEQUEEVENTO ce ON ce.IDTabla=a.ChequeEvento
 LEFT JOIN CHEQUE ch ON ch.IDTabla=ce.Cheque
 WHERE a.Cliente=? AND a.Cuenta IN ('COBRAR','PAGAR') AND a.Naturaleza IN ('DEUDA','CREDITO') AND ${reportMovement("a")}`;
async function associations(c: PoolConnection, rows: RowDataPacket[]) {
  const ids = rows.map((r) => String(r.Clave)),
    cashIds = [
      ...new Set(
        rows.flatMap((r) =>
          [r.CajaMovimiento, r.ChequeOrigen]
            .filter((v) => v != null)
            .map(String),
        ),
      ),
    ];
  if (!ids.length)
    return {
      allocations: [] as AccountLedgerAllocation[],
      values: [] as AccountLedgerValue[],
    };
  const [links] = await c.execute<RowDataPacket[]>(
    `SELECT f.CuentaCorriente,f.CajaMovimiento,f.Importe,
  dc.Descripcion AS DocumentoDescripcion,d.NumeroComprobante AS DocumentoNumero,
  mc.Descripcion AS OperacionDescripcion,m.NumeroComprobante AS OperacionNumero,
  DATE_FORMAT(m.FechaOrigen,'%Y-%m-%d') AS Fecha,m.Estado,
  rev.IDTabla AS RevertidoPor
  FROM CAJAMOVIMIENTOAFECTACION f JOIN CUENTACORRIENTE d ON d.IDTabla=f.CuentaCorriente
  JOIN COMPROBANTE dc ON dc.Codigo=d.Comprobante JOIN CAJAMOVIMIENTO m ON m.IDTabla=f.CajaMovimiento
  JOIN COMPROBANTE mc ON mc.Codigo=m.Comprobante
  LEFT JOIN CAJAMOVIMIENTO rev ON rev.CajaMovimientoOrigen=m.IDTabla AND rev.Estado='CONFIRMADO'
  WHERE ${reportMovement("m")} AND ${reportMovement("d")} AND (f.CuentaCorriente IN (${placeholders(ids)})${cashIds.length ? ` OR f.CajaMovimiento IN (${placeholders(cashIds)})` : ""}) ORDER BY f.IDTabla`,
    [...ids, ...cashIds],
  );
  const allocations: AccountLedgerAllocation[] = links.map((r) => ({
    CuentaCorriente: String(r.CuentaCorriente),
    CajaMovimiento: String(r.CajaMovimiento),
    Importe: String(r.Importe),
    Documento: operation(r.DocumentoDescripcion, r.DocumentoNumero)!,
    Operacion: operation(r.OperacionDescripcion, r.OperacionNumero)!,
    Fecha: String(r.Fecha),
    Estado:
      r.Estado === "ANULADO"
        ? "ANULADO"
        : r.RevertidoPor
          ? "REVERTIDO"
          : String(r.Estado),
    Vigente: r.Estado === "CONFIRMADO",
  }));
  const operations = [
    ...new Set([...cashIds, ...allocations.map((a) => a.CajaMovimiento)]),
  ];
  if (!operations.length)
    return { allocations, values: [] as AccountLedgerValue[] };
  const [transfers] = await c.execute<RowDataPacket[]>(
    `SELECT t.CajaMovimiento,t.Referencia AS Numero,t.Importe,bc.Nombre AS CuentaNombre,b.Nombre AS BancoNombre,
  m.Estado,m.NumeroComprobante,vc.Descripcion
  FROM TRANSFERENCIA t JOIN CAJAMOVIMIENTO m ON m.IDTabla=t.CajaMovimiento JOIN COMPROBANTE vc ON vc.Codigo=m.Comprobante
  JOIN BANCOCUENTA bc ON bc.Codigo=t.BancoCuenta JOIN BANCO b ON b.Codigo=bc.Banco
  WHERE ${reportMovement("m")} AND t.CajaMovimiento IN (${placeholders(operations)}) ORDER BY t.IDTabla`,
    operations,
  );
  const [cheques] = await c.execute<RowDataPacket[]>(
    `SELECT DISTINCT e.CajaMovimiento,ch.IDTabla,ch.Tipo,ch.Numero,ch.Importe,ch.Estado,b.Nombre AS BancoNombre,bc.Nombre AS CuentaNombre,m.NumeroComprobante,vc.Descripcion
  FROM CHEQUEEVENTO e JOIN CHEQUE ch ON ch.IDTabla=e.Cheque JOIN BANCO b ON b.Codigo=ch.Banco
  LEFT JOIN BANCOCUENTA bc ON bc.Codigo=ch.BancoCuenta JOIN CAJAMOVIMIENTO m ON m.IDTabla=e.CajaMovimiento
  JOIN COMPROBANTE vc ON vc.Codigo=m.Comprobante WHERE ${reportMovement("m")} AND e.CajaMovimiento IN (${placeholders(operations)}) ORDER BY e.CajaMovimiento,ch.IDTabla`,
    operations,
  );
  const value = (r: RowDataPacket, tipo: string): AccountLedgerValue => ({
    CajaMovimiento: String(r.CajaMovimiento),
    Operacion: operation(r.Descripcion, r.NumeroComprobante)!,
    Tipo: tipo,
    Numero: r.Numero == null ? "Sin referencia" : String(r.Numero),
    Importe: String(r.Importe),
    Estado: String(r.Estado),
    BancoNombre: String(r.BancoNombre),
    CuentaNombre: r.CuentaNombre == null ? null : String(r.CuentaNombre),
  });
  return {
    allocations,
    values: [
      ...transfers.map((r) => value(r, "TRANSFERENCIA")),
      ...cheques.map((r) => value(r, String(r.Tipo))),
    ],
  };
}
export async function accountLedger(
  pool: Pool,
  q: LedgerQuery,
): Promise<AccountLedger> {
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION READ ONLY");
    const [clients] = await c.execute<RowDataPacket[]>(
      "SELECT Codigo,Nombre FROM CLIENTE WHERE Codigo=?",
      [q.Cliente],
    );
    if (!clients[0]) throw new MasterRequestError(404, "El cliente no existe.");
    // Clasificar sin recortar la ventana: los anteriores alimentan el saldo;
    // los posteriores se resumen una sola vez en la fila «Saldo a vencer».
    const scoped = `SELECT b.*,${q.Desde ? "(b.FechaOrden < ?)" : "0"} AS Anterior,${q.Hasta ? "(b.FechaOrden > ?)" : "0"} AS Posterior FROM (${base}) b`;
    const params = [
      ...(q.Desde ? [q.Desde] : []),
      ...(q.Hasta ? [q.Hasta] : []),
      q.Cliente,
    ];
    const [totals] = await c.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(b.Anterior=0 AND b.Posterior=0),0) AS total,
    COALESCE(SUM(CASE WHEN b.Anterior=0 AND b.Posterior=0 THEN b.Debito ELSE 0 END),0) AS Debito,
    COALESCE(SUM(CASE WHEN b.Anterior=0 AND b.Posterior=0 THEN b.Credito ELSE 0 END),0) AS Credito,
    COALESCE(SUM(CASE WHEN b.Posterior=0 THEN b.Debito-b.Credito ELSE 0 END),0) AS SaldoFinal,
    COALESCE(SUM(CASE WHEN b.Posterior=0 THEN b.DeltaCobrar ELSE 0 END),0) AS SaldoCobrar,
    COALESCE(SUM(CASE WHEN b.Posterior=0 THEN b.DeltaPagar ELSE 0 END),0) AS SaldoPagar,
    COALESCE(SUM(CASE WHEN b.Posterior=1 THEN b.Debito ELSE 0 END),0) AS PosteriorDebito,
    COALESCE(SUM(CASE WHEN b.Posterior=1 THEN b.Credito ELSE 0 END),0) AS PosteriorCredito,
    COALESCE(SUM(CASE WHEN b.Posterior=1 THEN b.Debito-b.Credito ELSE 0 END),0) AS SaldoPosterior,
    COALESCE(SUM(b.Debito-b.Credito),0) AS SaldoCompleto,
    COALESCE(SUM(CASE WHEN b.Anterior=1 THEN b.Debito-b.Credito ELSE 0 END),0) AS SaldoAnterior,
    COALESCE(SUM(CASE WHEN b.Anterior=1 THEN b.Debito ELSE 0 END),0) AS AnteriorDebito,
    COALESCE(SUM(CASE WHEN b.Anterior=1 THEN b.Credito ELSE 0 END),0) AS AnteriorCredito,
    COALESCE(SUM(CASE WHEN b.Anterior=1 THEN b.DeltaCobrar ELSE 0 END),0) AS AnteriorCobrar,
    COALESCE(SUM(CASE WHEN b.Anterior=1 THEN b.DeltaPagar ELSE 0 END),0) AS AnteriorPagar
    FROM (${scoped}) b`,
      params,
    );
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT w.* FROM (SELECT b.*,
    SUM(b.Debito-b.Credito) OVER (ORDER BY b.FechaOrden,b.Clave ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS SaldoAcumulado,
    SUM(b.DeltaCobrar) OVER (ORDER BY b.FechaOrden,b.Clave ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS SaldoCobrar,
    SUM(b.DeltaPagar) OVER (ORDER BY b.FechaOrden,b.Clave ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS SaldoPagar
    FROM (${scoped}) b) w WHERE w.Anterior=0 AND w.Posterior=0 ORDER BY w.FechaOrden,w.Clave${q.continuo ? "" : " LIMIT ? OFFSET ?"}`,
      [...params, ...(q.continuo ? [] : [q.limite, (q.pagina - 1) * q.limite])],
    );
    const records: AccountLedgerRow[] = [];
    // Resolver metadatos por lotes dentro del mismo snapshot evita listas IN
    // ilimitadas y conserva una sola incidencia por asiento en informes extensos.
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      const related = await associations(c, batch);
      records.push(
        ...batch.map((r) => {
          const linked = related.allocations.filter(
            (a) =>
              a.CuentaCorriente === String(r.Clave) ||
              a.CajaMovimiento === String(r.CajaMovimiento),
          );
          const operationIds = new Set([
            ...[r.CajaMovimiento, r.ChequeOrigen]
              .filter((v) => v != null)
              .map(String),
            ...linked.map((a) => a.CajaMovimiento),
          ]);
          const text = [
            r.Concepto,
            r.Observacion,
            r.ChequeNumero
              ? `Rechazo de cheque ${String(r.ChequeNumero)}`
              : null,
          ]
            .filter(Boolean)
            .map(String);
          return {
            Clave: String(r.Clave),
            FechaOrigen: String(r.FechaOrigen),
            ComprobanteDescripcion: String(r.ComprobanteDescripcion),
            NumeroComprobanteTexto: formatVoucher(
              r.NumeroComprobante == null ? null : String(r.NumeroComprobante),
            ),
            Detalle: text.join(" · ") || "Movimiento de Cuenta corriente",
            Cuenta: String(r.Cuenta),
            Naturaleza: String(r.Naturaleza),
            Estado: String(r.Estado),
            EsReverso: Boolean(r.EsReverso),
            Debito: String(r.Debito),
            Credito: String(r.Credito),
            SaldoAcumulado: String(r.SaldoAcumulado),
            SaldoCobrar: String(r.SaldoCobrar),
            SaldoPagar: String(r.SaldoPagar),
            ImporteOriginal: String(r.ImporteOriginal),
            Operacion:
              operation(r.OperacionDescripcion, r.OperacionNumero) ??
              related.values.find(
                (v) => v.CajaMovimiento === String(r.ChequeOrigen),
              )?.Operacion ??
              null,
            Original: operation(r.OriginalDescripcion, r.OriginalNumero),
            Reversion: operation(r.ReversionDescripcion, r.ReversionNumero),
            MotivoAnulacion:
              r.MotivoAnulacion == null ? null : String(r.MotivoAnulacion),
            AnuladoEn: r.AnuladoEn == null ? null : String(r.AnuladoEn),
            Afectaciones: linked,
            Valores: related.values.filter((v) =>
              operationIds.has(v.CajaMovimiento),
            ),
          };
        }),
      );
    }
    await c.commit();
    const total = totals[0]!;
    return {
      registros: records,
      total: Number(total.total),
      pagina: q.continuo ? 1 : q.pagina,
      limite: q.continuo ? Math.max(1, Number(total.total)) : q.limite,
      Desde: q.Desde ?? null,
      Hasta: q.Hasta ?? null,
      saldoAnterior: {
        Debito: String(total.AnteriorDebito),
        Credito: String(total.AnteriorCredito),
        Saldo: String(total.SaldoAnterior),
        SaldoCobrar: String(total.AnteriorCobrar),
        SaldoPagar: String(total.AnteriorPagar),
      },
      saldoAVencer: {
        Debito: String(total.PosteriorDebito),
        Credito: String(total.PosteriorCredito),
        Saldo: String(total.SaldoPosterior),
        SaldoAcumulado: String(total.SaldoCompleto),
      },
      Cliente: String(clients[0].Codigo),
      ClienteNombre: String(clients[0].Nombre),
      consultadoEn: new Date().toISOString(),
      totales: {
        Debito: String(total.Debito),
        Credito: String(total.Credito),
        SaldoFinal: String(total.SaldoFinal),
        SaldoCobrar: String(total.SaldoCobrar),
        SaldoPagar: String(total.SaldoPagar),
      },
    };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
