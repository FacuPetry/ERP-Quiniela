import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucherNumber,
  type CurrentAccountDetail,
  type CurrentAccountInput,
  type CurrentAccountList,
  type CurrentAccountOptions,
  type CurrentAccountRecord,
} from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
import type { AccountQuery } from "./validation.js";

const eligible =
  "c.Activo = 1 AND c.ModuloOrigen = 'CUENTACORRIENTE' AND c.Cuenta IN ('COBRAR','PAGAR') AND c.Naturaleza IN ('DEUDA','CREDITO') AND c.SentidoFondos = 'NOAPLICA'";
const projection = `a.*, cl.Nombre AS ClienteNombre, c.Descripcion AS ComprobanteDescripcion,
  COALESCE(n.Serie, '0000') AS Serie, DATE_FORMAT(a.FechaOrigen, '%Y-%m-%d') AS FechaOrigen,
  DATE_FORMAT(a.Vencimiento, '%Y-%m-%d') AS Vencimiento`;
const joins =
  " FROM CUENTACORRIENTE a JOIN CLIENTE cl ON cl.Codigo = a.Cliente JOIN COMPROBANTE c ON c.Codigo = a.Comprobante LEFT JOIN NUMERACION n ON n.IDTabla = a.Numeracion";
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
  const series = /^\d{1,4}$/.test(String(data.Serie))
    ? String(data.Serie).padStart(4, "0")
    : null;
  data.NumeroComprobante =
    series && /^\d{1,8}$/.test(String(data.Numero))
      ? formatVoucherNumber(series, String(data.Numero))
      : "Numeración anterior";
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
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function identity(id: string) {
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new MasterRequestError(400, "Movimiento inválido.");
}

export function createCurrentAccountStore(pool: Pool) {
  async function transaction<T>(
    user: string,
    action: string,
    key: string,
    input: unknown,
    work: (connection: PoolConnection) => Promise<T>,
    namespace?: string,
  ): Promise<T> {
    const connection = await pool.getConnection();
    let started = false,
      lock: string | undefined,
      reusable = true;
    try {
      if (namespace) {
        const [db] = await connection.query<RowDataPacket[]>(
          "SELECT DATABASE() AS name",
        );
        const name = "erp_cc_" + hash([db[0]!.name, namespace]).slice(0, 48);
        try {
          const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT GET_LOCK(?, 10) AS acquired",
            [name],
          );
          if (Number(rows[0]?.acquired) !== 1)
            throw new MasterRequestError(
              503,
              "Otra operación está utilizando esta numeración. Reintentá en unos momentos.",
            );
          lock = name;
        } catch (error) {
          reusable = false;
          throw error;
        }
      }
      await connection.beginTransaction();
      started = true;
      const fingerprint = hash(input);
      try {
        await connection.execute(
          "INSERT INTO SOLICITUD (Usuario, Accion, Clave, Huella, Estado, CreadoEn) VALUES (?, ?, ?, ?, ?, ?)",
          [user, action, key, fingerprint, "PROCESANDO", new Date()],
        );
      } catch (error) {
        if (
          !(
            typeof error === "object" &&
            error &&
            "code" in error &&
            error.code === "ER_DUP_ENTRY"
          )
        )
          throw error;
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT Huella, Estado, Resultado FROM SOLICITUD WHERE Usuario = ? AND Accion = ? AND Clave = ? FOR UPDATE",
          [user, action, key],
        );
        if (rows[0]?.Huella !== fingerprint)
          throw new MasterRequestError(
            409,
            "La clave de reintento ya se utilizó con otros datos.",
          );
        if (rows[0]?.Estado !== "COMPLETADA")
          throw new MasterRequestError(
            409,
            "La solicitud anterior todavía no terminó.",
          );
        const result =
          typeof rows[0]!.Resultado === "string"
            ? JSON.parse(rows[0]!.Resultado)
            : rows[0]!.Resultado;
        await connection.commit();
        started = false;
        return result as T;
      }
      const result = await work(connection);
      await connection.execute(
        "UPDATE SOLICITUD SET Estado = ?, CodigoRespuesta = ?, Resultado = ? WHERE Usuario = ? AND Accion = ? AND Clave = ?",
        [
          "COMPLETADA",
          action === "CC_ALTA" ? 201 : 200,
          JSON.stringify(result),
          user,
          action,
          key,
        ],
      );
      await connection.commit();
      started = false;
      return result;
    } catch (error) {
      if (started) {
        try {
          await connection.rollback();
        } catch {
          reusable = false;
        }
      }
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      if (code === "ER_DUP_ENTRY")
        throw new MasterRequestError(
          409,
          "Ese comprobante y número ya están registrados, incluso si fueron anulados.",
        );
      if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT")
        throw new MasterRequestError(
          409,
          "Otra operación cambió estos datos. Intentá nuevamente.",
        );
      throw error;
    } finally {
      if (lock && reusable) {
        try {
          const [r] = await connection.execute<RowDataPacket[]>(
            "SELECT RELEASE_LOCK(?) AS released",
            [lock],
          );
          if (Number(r[0]?.released) !== 1) reusable = false;
        } catch {
          reusable = false;
        }
      }
      if (reusable) connection.release();
      else connection.destroy();
    }
  }

  return {
    async options(): Promise<CurrentAccountOptions> {
      const [comprobantes] = await pool.query<RowDataPacket[]>(
        "SELECT c.Codigo, c.Descripcion, c.Cuenta, c.Naturaleza FROM COMPROBANTE c WHERE " +
          eligible +
          " ORDER BY c.Orden, c.Codigo",
      );
      const [numeraciones] = await pool.query<RowDataPacket[]>(
        `SELECT n.IDTabla, n.Comprobante, n.Serie, n.ProximoNumero FROM NUMERACION n JOIN COMPROBANTE c ON c.Codigo = n.Comprobante WHERE n.Activo = 1 AND n.Serie REGEXP '^[0-9]{1,4}$' AND ${eligible} ORDER BY n.Serie`,
      );
      return {
        comprobantes: comprobantes as CurrentAccountOptions["comprobantes"],
        numeraciones: numeraciones.map((r) => ({
          IDTabla: String(r.IDTabla),
          Comprobante: String(r.Comprobante),
          Serie: String(r.Serie).padStart(4, "0"),
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
        clauses.push(
          "(cl.Nombre LIKE ? ESCAPE '!' OR c.Descripcion LIKE ? ESCAPE '!' OR a.Observacion LIKE ? ESCAPE '!' OR a.Cliente LIKE ? ESCAPE '!' OR CONCAT(LPAD(COALESCE(n.Serie, '0000'), 4, '0'), '-', LPAD(a.Numero, 8, '0')) LIKE ? ESCAPE '!')",
        );
        params.push(
          ...Array(5).fill("%" + query.q.replace(/[!%_]/g, "!$&") + "%"),
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
        prefix = input.NumeroComprobante.slice(0, 4),
        number = BigInt(input.NumeroComprobante.slice(5)).toString();
      return transaction(
        user,
        "CC_ALTA",
        key,
        input,
        async (connection) => {
          let numbering: RowDataPacket | undefined;
          if (input.Numeracion) {
            const [rows] = await connection.execute<RowDataPacket[]>(
              "SELECT * FROM NUMERACION WHERE IDTabla = ? FOR UPDATE",
              [input.Numeracion],
            );
            numbering = rows[0];
            if (
              !numbering ||
              !numbering.Activo ||
              numbering.Comprobante !== voucherCode ||
              !/^\d{1,4}$/.test(String(numbering.Serie)) ||
              String(numbering.Serie).padStart(4, "0") !== prefix
            )
              throw new MasterRequestError(
                409,
                "El Numerador cambió o no corresponde al comprobante y serie elegidos.",
              );
          } else if (prefix !== "0000")
            throw new MasterRequestError(
              400,
              "Sin Numerador el prefijo debe ser 0000.",
              { NumeroComprobante: "Usá 0000 seguido de ocho dígitos." },
            );
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
          // Incluye anulados y numeradores equivalentes (1 y 0001). Sin Numerador se usa 0000.
          for (const table of ["CUENTACORRIENTE", "CAJAMOVIMIENTO"]) {
            const [duplicates] = await connection.execute<RowDataPacket[]>(
              `SELECT a.IDTabla FROM ${table} a LEFT JOIN NUMERACION n ON n.IDTabla = a.Numeracion WHERE a.Comprobante = ? AND a.Numero = ? AND ((a.Numeracion IS NULL AND ? = '0000') OR (n.Serie REGEXP '^[0-9]{1,4}$' AND LPAD(n.Serie, 4, '0') = ?)) LIMIT 1`,
              [voucherCode, number, prefix, prefix],
            );
            if (duplicates.length)
              throw new MasterRequestError(
                409,
                "Ese comprobante y número ya están registrados, incluso si fueron anulados.",
              );
          }
          await connection.execute(
            "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,Numeracion,Numero,FechaOrigen,Vencimiento,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              clients[0].Codigo,
              voucherCode,
              input.Numeracion,
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
          if (numbering) {
            const [used] = await connection.execute<RowDataPacket[]>(
              "SELECT MAX(Numero) AS ultimo FROM (SELECT Numero FROM CUENTACORRIENTE WHERE Numeracion = ? UNION ALL SELECT Numero FROM CAJAMOVIMIENTO WHERE Numeracion = ?) r",
              [input.Numeracion, input.Numeracion],
            );
            const next = BigInt(used[0]!.ultimo) + 1n;
            const current = BigInt(numbering.ProximoNumero);
            await connection.execute(
              "UPDATE NUMERACION SET ProximoNumero = ? WHERE IDTabla = ?",
              [(next > current ? next : current).toString(), input.Numeracion],
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
