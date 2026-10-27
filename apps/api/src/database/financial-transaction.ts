import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { MasterRequestError } from "../masters/validation.js";
import { voucherLockName } from "./voucher-sequence.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function financialTransactions(pool: Pool, readCommitted = false) {
  return async function transaction<T>(
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
        const name = voucherLockName(String(db[0]!.name), namespace);
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
      if (readCommitted)
        await connection.query(
          "SET TRANSACTION ISOLATION LEVEL READ COMMITTED",
        );
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
          action.endsWith("_ALTA") || action === "CAJA_ABRIR" ? 201 : 200,
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
  };
}
