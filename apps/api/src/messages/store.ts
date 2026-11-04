import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  defaultMessageTemplate,
  renderMessageTemplate,
  type BalanceMessagePreview,
  type MessageTemplatePreference,
} from "@erp/shared";
import { readLedgerBalance } from "../reports/ledger.js";
import { MasterRequestError } from "../masters/validation.js";
import { balanceMessage, messageBalanceDate } from "./text.js";
import { whatsappPhone } from "./phone.js";

async function preference(
  c: Pool | PoolConnection,
  user: string,
  lock = false,
): Promise<MessageTemplatePreference> {
  const [rows] = await c.execute<RowDataPacket[]>(
    "SELECT MensajeSaldoPlantilla FROM USUARIO WHERE IDTabla=?" +
      (lock ? " FOR UPDATE" : ""),
    [user],
  );
  if (!rows[0])
    throw new MasterRequestError(401, "Ingresá nuevamente para continuar.");
  const Plantilla =
    rows[0].MensajeSaldoPlantilla == null
      ? null
      : String(rows[0].MensajeSaldoPlantilla);
  return {
    Plantilla,
    version: createHash("sha256")
      .update(JSON.stringify(Plantilla))
      .digest("hex"),
  };
}
export function createMessageStore(pool: Pool, now = () => new Date()) {
  return {
    template: (user: string) => preference(pool, user),
    async saveTemplate(
      user: string,
      Plantilla: string | null,
      version: string,
    ) {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const current = await preference(c, user, true);
        if (current.version !== version)
          throw new MasterRequestError(
            409,
            "El mensaje guardado cambió en otra sesión. Volvé a cargarlo antes de guardar.",
          );
        await c.execute(
          "UPDATE USUARIO SET MensajeSaldoPlantilla=? WHERE IDTabla=?",
          [Plantilla, user],
        );
        const saved = await preference(c, user);
        await c.commit();
        return saved;
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    },
    async preview(
      Cliente: string,
      user: string,
    ): Promise<BalanceMessagePreview> {
      const consulted = now();
      const FechaHasta = messageBalanceDate(consulted);
      const c = await pool.getConnection();
      try {
        await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await c.query("START TRANSACTION READ ONLY");
        const { client, total } = await readLedgerBalance(c, {
          Cliente,
          Hasta: FechaHasta,
        });
        const config = await preference(c, user);
        const [phones] = await c.execute<RowDataPacket[]>(
          "SELECT Telefono FROM CLIENTE WHERE Codigo=?",
          [Cliente],
        );
        const Telefono =
          phones[0]?.Telefono == null ? null : String(phones[0].Telefono);
        const SaldoTotal = String(total.SaldoFinal);
        const ClienteNombre = String(client.Nombre);
        const text = balanceMessage(ClienteNombre, SaldoTotal, FechaHasta);
        try {
          text.Mensaje = renderMessageTemplate(
            config.Plantilla ?? defaultMessageTemplate,
            text.Variables,
          );
        } catch (error) {
          throw new MasterRequestError(
            400,
            error instanceof Error
              ? error.message
              : "Revisá el mensaje guardado.",
          );
        }
        await c.commit();
        return {
          Cliente: String(client.Codigo),
          ClienteNombre,
          FechaHasta,
          SaldoTotal,
          ...text,
          Telefono,
          ...whatsappPhone(Telefono),
          consultadoEn: consulted.toISOString(),
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
export type MessageStore = ReturnType<typeof createMessageStore>;
