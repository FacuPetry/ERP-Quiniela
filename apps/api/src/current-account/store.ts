import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  voucherBase,
  voucherParts,
  nextVoucher,
  type CurrentAccountDetail,
  type CurrentAccountInput,
  type CurrentAccountList,
  type CurrentAccountOptions,
  type CurrentAccountRecord,
} from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
import { lastVoucher } from "../database/voucher-sequence.js";
import { financialTransactions } from "../database/financial-transaction.js";
import type { AccountQuery } from "./validation.js";

const eligible =
  "c.Activo = 1 AND c.ModuloOrigen = 'CUENTACORRIENTE' AND c.Cuenta IN ('COBRAR','PAGAR') AND c.Naturaleza IN ('DEUDA','CREDITO') AND c.SentidoFondos = 'NOAPLICA'";
const projection = `a.*, cl.Nombre AS ClienteNombre, c.Descripcion AS ComprobanteDescripcion,
  DATE_FORMAT(a.FechaOrigen, '%Y-%m-%d') AS FechaOrigen,
  DATE_FORMAT(a.Vencimiento, '%Y-%m-%d') AS Vencimiento`;
const joins =
  " FROM CUENTACORRIENTE a JOIN CLIENTE cl ON cl.Codigo = a.Cliente JOIN COMPROBANTE c ON c.Codigo = a.Comprobante";
function detail(row: RowDataPacket): CurrentAccountDetail {
  const data = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value == null
        ? null
        : value instanceof Date
          ? value.toISOString()
          : String(value),
    ]),
  );
  data.NumeroComprobanteTexto = formatVoucher(data.NumeroComprobante ?? null);
  const registro = data as unknown as CurrentAccountRecord;
  return {
    registro,
    version: createHash("sha256")
      .update(
        JSON.stringify({
          ...data,
          ClienteNombre: undefined,
          ComprobanteDescripcion: undefined,
        }),
      )
      .digest("hex"),
  };
}
async function read(connection: Pool | PoolConnection, id: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT " + projection + joins + " WHERE a.IDTabla = ?",
    [id],
  );
  if (!rows[0]) throw new MasterRequestError(404, "El movimiento no existe.");
  return detail(rows[0]);
}
function identity(id: string) {
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new MasterRequestError(400, "Movimiento inválido.");
}

export function createCurrentAccountStore(pool: Pool) {
  const transaction = financialTransactions(pool);

  return {
    async options(): Promise<CurrentAccountOptions> {
      const [comprobantes] = await pool.query<RowDataPacket[]>(
        "SELECT c.Codigo, c.Descripcion, c.Cuenta, c.Naturaleza FROM COMPROBANTE c WHERE " +
          eligible +
          " ORDER BY c.Orden, c.Codigo",
      );
      const [numeradores] = await pool.query<RowDataPacket[]>(
        `SELECT n.Comprobante, n.ProximoNumero FROM NUMERACION n JOIN COMPROBANTE c ON c.Codigo = n.Comprobante WHERE n.Activo = 1 AND ${eligible} ORDER BY n.Comprobante`,
      );
      return {
        comprobantes: comprobantes as CurrentAccountOptions["comprobantes"],
        numeradores: numeradores.map((r) => ({
          Comprobante: String(r.Comprobante),
          ProximoNumero: String(r.ProximoNumero),
        })),
      };
    },
    async list(query: AccountQuery): Promise<CurrentAccountList> {
      const clauses: string[] = [],
        params: (string | number)[] = [];
      for (const field of ["Cliente", "Comprobante", "Cuenta"] as const)
        if (query[field]) {
          clauses.push("a." + field + " = ?");
          params.push(query[field]!);
        }
      if (query.Estado !== "TODOS") {
        clauses.push("a.Estado = ?");
        params.push(query.Estado);
      }
      if (query.Desde) {
        clauses.push("a.FechaOrigen >= ?");
        params.push(query.Desde);
      }
      if (query.Hasta) {
        clauses.push("a.FechaOrigen <= ?");
        params.push(query.Hasta);
      }
      if (query.q) {
        // El número formateado no hereda la collation de una columna textual.
        // Fijarla evita conflictos de LIKE al reutilizar sentencias en MariaDB.
        clauses.push(
          "(cl.Nombre LIKE ? ESCAPE '!' OR c.Descripcion LIKE ? ESCAPE '!' OR a.Observacion LIKE ? ESCAPE '!' OR a.Cliente LIKE ? ESCAPE '!' OR CONVERT(CONCAT(LPAD((a.NumeroComprobante DIV 100000000), 4, '0'), '-', LPAD(MOD(a.NumeroComprobante,100000000), 8, '0')) USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!' OR a.NumeroComprobante = ?)",
        );
        params.push(
          ...Array(5).fill("%" + query.q.replace(/[!%_]/g, "!$&") + "%"),
          /^[0-9]{1,12}$/.test(query.q) ? BigInt(query.q).toString() : "0",
        );
      }
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [count] = await connection.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total" + joins + where,
          params,
        );
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT " +
            projection +
            joins +
            where +
            " ORDER BY a.FechaOrigen DESC, a.IDTabla DESC LIMIT ? OFFSET ?",
          [...params, query.limite, (query.pagina - 1) * query.limite],
        );
        let saldos: CurrentAccountList["saldos"] = null;
        if (query.Cliente) {
          const [sums] = await connection.execute<RowDataPacket[]>(
            "SELECT Cuenta, SUM(CASE WHEN Naturaleza = 'DEUDA' THEN Importe ELSE -Importe END) AS saldo FROM CUENTACORRIENTE WHERE Cliente = ? AND Estado = 'CONFIRMADO' AND Naturaleza IN ('DEUDA','CREDITO') GROUP BY Cuenta",
            [query.Cliente],
          );
          saldos = { Cobrar: "0.00", Pagar: "0.00" };
          for (const row of sums)
            if (row.Cuenta === "COBRAR") saldos.Cobrar = String(row.saldo);
            else if (row.Cuenta === "PAGAR") saldos.Pagar = String(row.saldo);
        }
        await connection.commit();
        return {
          registros: rows.map((r) => detail(r).registro),
          total: Number(count[0]!.total),
          pagina: query.pagina,
          limite: query.limite,
          saldos,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async get(id: string) {
      identity(id);
      return read(pool, id);
    },
    async create(input: CurrentAccountInput, user: string, key: string) {
      // Lectura previa solo para construir el nombre del bloqueo. Se comprueba otra vez al guardar.
      const [vouchers] = await pool.execute<RowDataPacket[]>(
        "SELECT Codigo FROM COMPROBANTE WHERE Codigo = ?",
        [input.Comprobante],
      );
      if (!vouchers[0])
        throw new MasterRequestError(400, "El comprobante no existe.");
      const voucherCode = String(vouchers[0].Codigo),
        prefix = voucherParts(input.NumeroComprobante).point,
        number = BigInt(input.NumeroComprobante).toString();
      return transaction(
        user,
        "CC_ALTA",
        key,
        input,
        async (connection) => {
          const [numberings] = await connection.execute<RowDataPacket[]>(
            "SELECT * FROM NUMERACION WHERE Comprobante = ? FOR UPDATE",
            [voucherCode],
          );
          const numbering = numberings[0];
          const [vouchers] = await connection.execute<RowDataPacket[]>(
            "SELECT c.* FROM COMPROBANTE c WHERE c.Codigo = ? AND " +
              eligible +
              " LOCK IN SHARE MODE",
            [voucherCode],
          );
          const voucher = vouchers[0];
          if (!voucher)
            throw new MasterRequestError(
              400,
              "Seleccioná un comprobante activo de Cuenta corriente con cuenta y naturaleza aplicables, sin movimiento de fondos.",
            );
          const [clients] = await connection.execute<RowDataPacket[]>(
            "SELECT Codigo FROM CLIENTE WHERE Codigo = ? AND Activo = 1 LOCK IN SHARE MODE",
            [input.Cliente],
          );
          if (!clients[0])
            throw new MasterRequestError(400, "Seleccioná un cliente activo.");
          for (const table of ["CUENTACORRIENTE", "CAJAMOVIMIENTO"]) {
            const [duplicates] = await connection.execute<RowDataPacket[]>(
              `SELECT IDTabla FROM ${table} WHERE Comprobante = ? AND NumeroComprobante = ? LIMIT 1`,
              [voucherCode, number],
            );
            if (duplicates.length)
              throw new MasterRequestError(
                409,
                "Ese comprobante y número ya están registrados, incluso si fueron anulados.",
              );
          }
          await connection.execute(
            "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,NumeroComprobante,FechaOrigen,Vencimiento,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              clients[0].Codigo,
              voucherCode,
              number,
              input.FechaOrigen,
              input.Vencimiento,
              voucher.Cuenta,
              voucher.Naturaleza,
              input.Importe,
              input.Observacion,
              "CONFIRMADO",
              user,
              new Date(),
            ],
          );
          const [ids] = await connection.query<RowDataPacket[]>(
            "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
          );
          const id = String(ids[0]!.id);
          if (
            numbering?.Activo &&
            BigInt(numbering.ProximoNumero) / voucherBase ===
              BigInt(number) / voucherBase
          ) {
            const highest = (await lastVoucher(
              connection,
              voucherCode,
              number,
            ))!;
            const next = nextVoucher(highest.toString());
            const current = BigInt(numbering.ProximoNumero);
            await connection.execute(
              "UPDATE NUMERACION SET ProximoNumero = ?, Activo = ? WHERE IDTabla = ?",
              [
                next === null
                  ? highest.toString()
                  : BigInt(next) > current
                    ? next
                    : current.toString(),
                next !== null ? 1 : 0,
                String(numbering.IDTabla),
              ],
            );
          }
          const result = await read(connection, id);
          await connection.execute(
            "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Detalle) VALUES (?,?,?,?,?,?)",
            [
              user,
              "ALTA",
              "CUENTACORRIENTE",
              id,
              new Date(),
              JSON.stringify({ Despues: result.registro }),
            ],
          );
          return result;
        },
        JSON.stringify([voucherCode, prefix]),
      );
    },
    async cancel(
      id: string,
      reason: string,
      version: string | undefined,
      user: string,
      key: string,
    ) {
      identity(id);
      return transaction(
        user,
        "CC_ANULAR",
        key,
        { id, reason, version },
        async (connection) => {
          const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT IDTabla FROM CUENTACORRIENTE WHERE IDTabla = ? FOR UPDATE",
            [id],
          );
          if (!rows[0])
            throw new MasterRequestError(404, "El movimiento no existe.");
          const before = await read(connection, id);
          if (before.version !== version)
            throw new MasterRequestError(
              409,
              "El movimiento cambió. Volvé al listado y abrilo nuevamente.",
            );
          const [applications] = await connection.execute<RowDataPacket[]>(
            "SELECT IDTabla FROM CAJAMOVIMIENTOAFECTACION WHERE CuentaCorriente = ? LIMIT 1",
            [id],
          );
          if (
            before.registro.Estado !== "CONFIRMADO" ||
            before.registro.CajaMovimiento ||
            applications.length
          )
            throw new MasterRequestError(
              409,
              "Solo se pueden anular movimientos manuales confirmados sin cobros, pagos o afectaciones relacionados.",
            );
          await connection.execute(
            "UPDATE CUENTACORRIENTE SET Estado = 'ANULADO', UsuarioAnulacion = ?, AnuladoEn = ?, MotivoAnulacion = ? WHERE IDTabla = ?",
            [user, new Date(), reason, id],
          );
          const result = await read(connection, id);
          await connection.execute(
            "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Motivo,Detalle) VALUES (?,?,?,?,?,?,?)",
            [
              user,
              "ANULACION",
              "CUENTACORRIENTE",
              id,
              new Date(),
              reason,
              JSON.stringify({
                Antes: before.registro,
                Despues: result.registro,
              }),
            ],
          );
          return result;
        },
      );
    },
  };
}
export type CurrentAccountStore = ReturnType<typeof createCurrentAccountStore>;
