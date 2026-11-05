import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { MessageNotice, MessageNoticesResult } from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";
import type { MessageSnapshot } from "./receipt.js";
const fields = `SELECT n.Huella,n.IDTabla,n.Cliente,n.ClienteNombre,n.Telefono,n.WhatsAppNumero,n.SaldoTotal,n.Mensaje,n.Canal,
  DATE_FORMAT(n.RegistradoEn,'%Y-%m-%dT%H:%i:%s.%fZ') AS RegistradoEn,DATE_FORMAT(n.FechaSaldo,'%Y-%m-%d') AS FechaSaldo,
  u.Nombre AS UsuarioNombre FROM MENSAJEAVISO n JOIN USUARIO u ON u.IDTabla=n.Usuario`;
function notice(r: RowDataPacket): MessageNotice {
  return {
    IDTabla: String(r.IDTabla),
    Cliente: String(r.Cliente),
    ClienteNombre: String(r.ClienteNombre),
    UsuarioNombre: String(r.UsuarioNombre),
    RegistradoEn: String(r.RegistradoEn),
    FechaSaldo: String(r.FechaSaldo),
    SaldoTotal: String(r.SaldoTotal),
    Telefono: r.Telefono == null ? null : String(r.Telefono),
    WhatsAppNumero: r.WhatsAppNumero == null ? null : String(r.WhatsAppNumero),
    Mensaje: String(r.Mensaje),
    Canal: "WHATSAPP_MANUAL",
  };
}
export async function lastMessageNotices(c: PoolConnection, clients: string[]) {
  const result = new Map<string, MessageNotice>();
  if (!clients.length) return result;
  const [rows] = await c.execute<RowDataPacket[]>(
    `${fields} WHERE n.Cliente IN (${clients.map(() => "?").join(",")})
    AND n.IDTabla=(SELECT last_n.IDTabla FROM MENSAJEAVISO last_n WHERE last_n.Cliente=n.Cliente ORDER BY last_n.RegistradoEn DESC,last_n.IDTabla DESC LIMIT 1)`,
    clients,
  );
  for (const row of rows) result.set(String(row.Cliente), notice(row));
  return result;
}
export function createNoticeStore(pool: Pool, now: () => Date) {
  return {
    async registerNotice(
      snapshot: MessageSnapshot,
      Mensaje: string,
      user: string,
      key: string,
    ): Promise<MessageNotice> {
      const data = { ...snapshot, Mensaje };
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      try {
        await pool.execute(
          `INSERT INTO MENSAJEAVISO (Cliente,Usuario,Clave,Huella,RegistradoEn,FechaSaldo,SaldoTotal,ClienteNombre,Telefono,WhatsAppNumero,Mensaje,Canal) VALUES (?,?,?,?,?,?,?,?,?,?,?,'WHATSAPP_MANUAL')`,
          [
            snapshot.Cliente,
            user,
            key,
            fingerprint,
            now(),
            snapshot.FechaHasta,
            snapshot.SaldoTotal,
            snapshot.ClienteNombre,
            snapshot.Telefono,
            snapshot.WhatsAppNumero,
            Mensaje,
          ],
        );
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : null;
        if (code === "ER_NO_REFERENCED_ROW_2")
          throw new MasterRequestError(
            409,
            "El cliente ya no existe. No se registró el aviso.",
          );
        if (code !== "ER_DUP_ENTRY") throw error;
      }
      // La misma clave de confirmación devuelve el registro original, también
      // si dos peticiones llegan a la vez o se perdió la primera respuesta.
      const [rows] = await pool.execute<RowDataPacket[]>(
        `${fields} WHERE n.Usuario=? AND n.Clave=?`,
        [user, key],
      );
      if (!rows[0] || rows[0].Huella !== fingerprint)
        throw new MasterRequestError(
          409,
          "La confirmación ya se utilizó con otro mensaje. Cerrá y volvé a registrar el envío.",
        );
      return notice(rows[0]);
    },
    async notices(
      Cliente: string,
      pagina: number,
      limite: number,
    ): Promise<MessageNoticesResult> {
      const c = await pool.getConnection();
      try {
        await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await c.query("START TRANSACTION READ ONLY");
        const [clients] = await c.execute<RowDataPacket[]>(
          "SELECT Codigo FROM CLIENTE WHERE Codigo=?",
          [Cliente],
        );
        if (!clients[0])
          throw new MasterRequestError(404, "El cliente no existe.");
        const [totals] = await c.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM MENSAJEAVISO WHERE Cliente=?",
          [Cliente],
        );
        const [rows] = await c.execute<RowDataPacket[]>(
          `${fields} WHERE n.Cliente=? ORDER BY n.RegistradoEn DESC,n.IDTabla DESC LIMIT ? OFFSET ?`,
          [Cliente, limite, (pagina - 1) * limite],
        );
        await c.commit();
        return {
          registros: rows.map(notice),
          total: Number(totals[0]!.total),
          pagina,
          limite,
        };
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    },
  };
}
