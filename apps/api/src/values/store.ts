import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  valueStates,
  valueTypes,
  type ValueRecordDetail,
  type ValueRecord,
  type ValueList,
  type ValueOperation,
  type ValueEvent,
  type ValueFamily,
} from "@erp/shared";
import { listOrder, optionOrder } from "../database/list-order.js";
import { MasterRequestError } from "../masters/validation.js";
import type { ValueQuery } from "./validation.js";

const state = (alias: string) =>
  `CASE WHEN ${alias}.Estado='ANULADO' THEN 'ANULADO' WHEN EXISTS(SELECT 1 FROM CAJAMOVIMIENTO reverse_m WHERE reverse_m.CajaMovimientoOrigen=${alias}.IDTabla AND reverse_m.Estado='CONFIRMADO') THEN 'REVERTIDO' ELSE ${alias}.Estado END`;
// Un cheque tiene una fila, independientemente de cuántos eventos/operaciones tenga.
const valuesSql = `
 SELECT ch.IDTabla,'CHEQUE' AS Familia,ch.Tipo,ch.Numero,ch.Emision AS Fecha,ch.Vencimiento,ch.Importe,ch.Estado,
 ch.Banco,b.Nombre AS BancoNombre,ch.BancoCuenta,bc.Nombre AS CuentaNombre,cl.Nombre AS ClienteNombre,
 c.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante,m.IDTabla AS OrigenCajaMovimiento,ch.CreadoEn,u.Nombre AS UsuarioNombre,cl.Codigo AS Cliente,ch.Librador
 FROM CHEQUE ch JOIN BANCO b ON b.Codigo=ch.Banco LEFT JOIN BANCOCUENTA bc ON bc.Codigo=ch.BancoCuenta
 JOIN COMPROBANTE c ON c.Codigo=ch.Comprobante JOIN USUARIO u ON u.IDTabla=ch.Usuario
 LEFT JOIN CHEQUEEVENTO first_e ON first_e.IDTabla=(SELECT MIN(e.IDTabla) FROM CHEQUEEVENTO e WHERE e.Cheque=ch.IDTabla AND e.Tipo IN ('RECEPCION','EMISION') AND e.CajaMovimiento IS NOT NULL)
 LEFT JOIN CAJAMOVIMIENTO m ON m.IDTabla=first_e.CajaMovimiento LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente
 UNION ALL
 SELECT t.IDTabla,'TRANSFERENCIA','TRANSFERENCIA',COALESCE(t.Referencia,''),t.Fecha,NULL,t.Importe,${state("m")},
 bc.Banco,b.Nombre,t.BancoCuenta,bc.Nombre,cl.Nombre,c.Descripcion,m.NumeroComprobante,m.IDTabla,t.CreadoEn,u.Nombre,cl.Codigo,NULL
 FROM TRANSFERENCIA t JOIN BANCOCUENTA bc ON bc.Codigo=t.BancoCuenta JOIN BANCO b ON b.Codigo=bc.Banco
 JOIN COMPROBANTE c ON c.Codigo=t.Comprobante JOIN CAJAMOVIMIENTO m ON m.IDTabla=t.CajaMovimiento
 JOIN USUARIO u ON u.IDTabla=t.Usuario LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente
`;
const projection = `v.*,DATE_FORMAT(v.Fecha,'%Y-%m-%d') AS Fecha,DATE_FORMAT(v.Vencimiento,'%Y-%m-%d') AS Vencimiento`;
function stringify(r: RowDataPacket) {
  return Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString() : v == null ? null : String(v),
    ]),
  );
}
function record(row: RowDataPacket): ValueRecord {
  return {
    ...stringify(row),
    Clave: `${row.Familia}:${row.IDTabla}`,
    NumeroComprobanteTexto:
      row.NumeroComprobante == null
        ? null
        : formatVoucher(String(row.NumeroComprobante)),
  } as unknown as ValueRecord;
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
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
const roots = (family: ValueFamily) =>
  family === "CHEQUE"
    ? "SELECT e.CajaMovimiento FROM CHEQUEEVENTO e WHERE e.Cheque=? AND e.CajaMovimiento IS NOT NULL"
    : "SELECT t.CajaMovimiento FROM TRANSFERENCIA t WHERE t.IDTabla=?";

export function createValuesStore(pool: Pool) {
  return {
    async list(q: ValueQuery): Promise<ValueList> {
      const order =
        listOrder(
          q,
          {
            Tipo: optionOrder("v.Tipo", valueTypes),
            Numero:
              "CASE WHEN v.Familia='CHEQUE' AND v.Numero REGEXP '^[0-9]+$' THEN LPAD(TRIM(LEADING '0' FROM v.Numero),30,'0') ELSE v.Numero END",
            Fecha: "v.Fecha",
            Vencimiento: "v.Vencimiento",
            Importe: "v.Importe",
            Banco: "v.BancoNombre",
            BancoCuenta: "v.CuentaNombre",
            Estado: optionOrder("v.Estado", valueStates),
            Cliente: "v.ClienteNombre",
            CreadoEn: "v.CreadoEn",
          },
          "v.CreadoEn",
        ) + ",v.IDTabla ASC,v.Familia ASC";
      const clauses: string[] = [],
        params: (string | number)[] = [];
      if (q.Tipo !== "TODOS") {
        clauses.push("v.Tipo=?");
        params.push(q.Tipo);
      }
      if (q.Estado !== "TODOS") {
        clauses.push("v.Estado=?");
        params.push(q.Estado);
      }
      for (const field of ["Banco", "BancoCuenta"] as const)
        if (q[field]) {
          clauses.push(`v.${field}=?`);
          params.push(q[field]!);
        }
      const dateField =
        q.FechaPor === "VENCIMIENTO" ? "v.Vencimiento" : "v.Fecha";
      if (q.FechaPor === "VENCIMIENTO") clauses.push("v.Familia='CHEQUE'");
      if (q.Desde) {
        clauses.push(dateField + ">=?");
        params.push(q.Desde);
      }
      if (q.Hasta) {
        clauses.push(dateField + "<=?");
        params.push(q.Hasta);
      }
      if (q.q) {
        const fields = [
          "v.Numero",
          "v.BancoNombre",
          "v.CuentaNombre",
          "v.ClienteNombre",
          "v.Cliente",
          "v.Librador",
          "v.ComprobanteDescripcion",
          "CONCAT(LPAD(FLOOR(v.NumeroComprobante/100000000),4,'0'),'-',LPAD(MOD(v.NumeroComprobante,100000000),8,'0'))",
        ];
        clauses.push(
          "(" +
            fields
              .map(
                (f) =>
                  `CONVERT(${f} USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!'`,
              )
              .join(" OR ") +
            ")",
        );
        params.push(
          ...fields.map(() => "%" + q.q.replace(/[!%_]/g, "!$&") + "%"),
        );
      }
      const from =
        ` FROM (${valuesSql}) v` +
        (clauses.length ? " WHERE " + clauses.join(" AND ") : "");
      return snapshot(pool, async (c) => {
        const [count] = await c.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total" + from,
          params,
        );
        const [rows] = await c.execute<RowDataPacket[]>(
          "SELECT " +
            projection +
            from +
            " ORDER BY " +
            order +
            " LIMIT ? OFFSET ?",
          [...params, q.limite, (q.pagina - 1) * q.limite],
        );
        return {
          registros: rows.map(record),
          total: Number(count[0]!.total),
          pagina: q.pagina,
          limite: q.limite,
        };
      });
    },
    async detail(family: ValueFamily, id: string): Promise<ValueRecordDetail> {
      return snapshot(pool, async (c) => {
        const [rows] = await c.execute<RowDataPacket[]>(
          `SELECT ${projection} FROM (${valuesSql}) v WHERE v.Familia=? AND v.IDTabla=?`,
          [family, id],
        );
        if (!rows[0])
          throw new MasterRequestError(
            404,
            "El valor no existe. Actualizá el listado.",
          );
        const r = record(rows[0]);
        const root = roots(family);
        const [operations] = await c.execute<RowDataPacket[]>(
          `
          SELECT m.IDTabla,c.Descripcion AS ComprobanteDescripcion,m.NumeroComprobante,
          DATE_FORMAT(m.FechaOrigen,'%Y-%m-%d') AS FechaOrigen,cl.Nombre AS ClienteNombre,ca.Nombre AS CajaNombre,
          ${state("m")} AS Estado,m.CajaMovimientoOrigen,m.CreadoEn,u.Nombre AS UsuarioNombre,
          m.AnuladoEn,au.Nombre AS AnuladoPor,m.MotivoAnulacion,m.Observacion,
          CASE WHEN m.Cliente IS NULL AND NOT EXISTS(SELECT 1 FROM CUENTACORRIENTE cc WHERE cc.CajaMovimiento=m.IDTabla) THEN 'TESORERIA' ELSE 'COBROSPAGOS' END AS Modulo
          FROM CAJAMOVIMIENTO m JOIN COMPROBANTE c ON c.Codigo=m.Comprobante JOIN USUARIO u ON u.IDTabla=m.Usuario
          LEFT JOIN USUARIO au ON au.IDTabla=m.UsuarioAnulacion LEFT JOIN CLIENTE cl ON cl.Codigo=m.Cliente
          LEFT JOIN CAJASALDO cs ON cs.IDTabla=m.CajaSaldo LEFT JOIN CAJA ca ON ca.Codigo=cs.Caja
          WHERE m.IDTabla IN (${root}) OR m.CajaMovimientoOrigen IN (${root})
            OR m.IDTabla IN (SELECT parent.CajaMovimientoOrigen FROM CAJAMOVIMIENTO parent WHERE parent.IDTabla IN (${root}))
          ORDER BY m.CreadoEn,m.IDTabla`,
          [id, id, id],
        );
        const related = operations.map((row) => ({
          ...stringify(row),
          NumeroComprobanteTexto: formatVoucher(String(row.NumeroComprobante)),
        })) as unknown as ValueOperation[];
        const operation = (id: string | null) =>
          related.find((m) => m.IDTabla === id);
        const opLabel = (id: string | null) => {
          const m = operation(id);
          return m
            ? `${m.ComprobanteDescripcion} · ${m.NumeroComprobanteTexto}`
            : null;
        };
        let datos: ValueRecordDetail["datos"];
        let historial: ValueEvent[];
        if (family === "CHEQUE") {
          const [extra] = await c.execute<RowDataPacket[]>(
            "SELECT CuentaLibradora,Librador,Documento FROM CHEQUE WHERE IDTabla=?",
            [id],
          );
          datos = {
            ...stringify(extra[0]!),
            Observacion: null,
          } as ValueRecordDetail["datos"];
          const [events] = await c.execute<RowDataPacket[]>(
            `SELECT e.IDTabla,e.Tipo,DATE_FORMAT(e.Fecha,'%Y-%m-%d') AS Fecha,e.CreadoEn AS RegistradoEn,u.Nombre AS UsuarioNombre,bc.Nombre AS CuentaNombre,e.Observacion,e.CajaMovimiento
            FROM CHEQUEEVENTO e JOIN USUARIO u ON u.IDTabla=e.Usuario LEFT JOIN BANCOCUENTA bc ON bc.Codigo=e.BancoCuenta
            WHERE e.Cheque=? ORDER BY e.IDTabla`,
            [id],
          );
          historial = events.map((e) => ({
            ...stringify(e),
            Clave: String(e.IDTabla),
            Operacion: opLabel(
              e.CajaMovimiento == null ? null : String(e.CajaMovimiento),
            ),
            EstadoOperacion:
              operation(String(e.CajaMovimiento))?.Estado ?? null,
          })) as unknown as ValueEvent[];
        } else {
          const [extra] = await c.execute<RowDataPacket[]>(
            "SELECT Observacion FROM TRANSFERENCIA WHERE IDTabla=?",
            [id],
          );
          datos = {
            CuentaLibradora: null,
            Librador: null,
            Documento: null,
            Observacion:
              extra[0]!.Observacion == null
                ? null
                : String(extra[0]!.Observacion),
          };
          const source = operation(r.OrigenCajaMovimiento);
          historial = [
            {
              Clave: "registro",
              Tipo: source?.CajaMovimientoOrigen
                ? "REGISTRO_REVERSION"
                : "REGISTRO",
              Fecha: r.Fecha,
              RegistradoEn: r.CreadoEn,
              UsuarioNombre: r.UsuarioNombre,
              CuentaNombre: r.CuentaNombre,
              Observacion: datos.Observacion ?? source?.Observacion ?? null,
              CajaMovimiento: r.OrigenCajaMovimiento,
              Operacion: opLabel(r.OrigenCajaMovimiento),
              EstadoOperacion: source?.Estado ?? null,
            },
          ];
          if (source?.AnuladoEn)
            historial.push({
              ...historial[0]!,
              Clave: "anulacion",
              Tipo: "ANULACION",
              Fecha: new Intl.DateTimeFormat("sv-SE", {
                timeZone: "America/Argentina/Buenos_Aires",
              }).format(new Date(source.AnuladoEn)),
              RegistradoEn: source.AnuladoEn,
              UsuarioNombre: source.AnuladoPor ?? "",
              Observacion: source.MotivoAnulacion,
            });
          for (const reverse of related.filter(
            (m) => m.CajaMovimientoOrigen === r.OrigenCajaMovimiento,
          ))
            historial.push({
              Clave: "reversion-" + reverse.IDTabla,
              Tipo: "REVERSION",
              Fecha: reverse.FechaOrigen,
              RegistradoEn: reverse.CreadoEn,
              UsuarioNombre: reverse.UsuarioNombre,
              CuentaNombre: r.CuentaNombre,
              Observacion: reverse.Observacion,
              CajaMovimiento: reverse.IDTabla,
              Operacion: opLabel(reverse.IDTabla),
              EstadoOperacion: reverse.Estado,
            });
        }
        return { registro: r, datos, historial, operaciones: related };
      });
    },
  };
}
export type ValuesStore = ReturnType<typeof createValuesStore>;
