import type { Pool } from "mysql2/promise";
import type { BalanceMessagePreview } from "@erp/shared";
import { readLedgerBalance } from "../reports/ledger.js";
import { balanceMessage, messageBalanceDate } from "./text.js";

export function createMessageStore(pool: Pool, now = () => new Date()) {
  return {
    async preview(Cliente: string): Promise<BalanceMessagePreview> {
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
        const SaldoTotal = String(total.SaldoFinal);
        const ClienteNombre = String(client.Nombre);
        const text = balanceMessage(ClienteNombre, SaldoTotal, FechaHasta);
        await c.commit();
        return {
          Cliente: String(client.Codigo),
          ClienteNombre,
          FechaHasta,
          SaldoTotal,
          ...text,
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
