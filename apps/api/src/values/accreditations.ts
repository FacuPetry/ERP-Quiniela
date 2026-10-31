import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  moneyText,
  moneyUnits,
  type ChequeAccreditationInput,
  type ChequeAccreditationResult,
} from "@erp/shared";
import { financialTransactions } from "../database/financial-transaction.js";
import { MasterRequestError } from "../masters/validation.js";
import {
  activeChequeAccount,
  auditChequeEvent,
  lockCheques,
  recordChequeEvent,
} from "./cheque-events.js";

/** Confirmación manual de una acreditación bancaria real. La cuenta e importe
 * provienen del depósito/instrumento, nunca de parámetros editables del cliente. */
export function chequeAccreditations(pool: Pool) {
  const transaction = financialTransactions(pool, true);
  return (
    input: ChequeAccreditationInput,
    user: string,
    key: string,
  ): Promise<ChequeAccreditationResult> =>
    transaction(user, "VALORES_ACREDITACION", key, input, async (c) => {
      const cheques = await lockCheques(c, input, "DEPOSITADO");
      const accounts = new Map<string, string>();
      for (const cheque of cheques) {
        const [events] = await c.execute<RowDataPacket[]>(
          "SELECT Tipo,BancoCuenta FROM CHEQUEEVENTO WHERE Cheque=? ORDER BY IDTabla DESC LIMIT 1",
          [cheque.IDTabla],
        );
        const deposit = events[0];
        if (!deposit || deposit.Tipo !== "DEPOSITO" || !deposit.BancoCuenta)
          throw new MasterRequestError(
            409,
            "Un cheque no tiene un depósito válido con cuenta de destino. Revisá su historial antes de acreditarlo.",
          );
        const [existing] = await c.execute<RowDataPacket[]>(
          "SELECT bm.IDTabla FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=? LIMIT 1",
          [cheque.IDTabla],
        );
        if (existing.length)
          throw new MasterRequestError(
            409,
            "Un cheque ya tiene movimientos bancarios. Revisá su historial para evitar una acreditación duplicada.",
          );
        accounts.set(String(cheque.IDTabla), String(deposit.BancoCuenta));
      }
      // Orden estable también para cuentas de lotes con varios destinos.
      for (const account of [...new Set(accounts.values())].sort())
        await activeChequeAccount(c, account);
      const now = new Date();
      for (const cheque of cheques) {
        const account = accounts.get(String(cheque.IDTabla))!;
        const event = await recordChequeEvent(
          c,
          cheque,
          input,
          account,
          user,
          now,
          "ACREDITACION",
          "ACREDITADO",
        );
        await c.execute(
          "INSERT INTO BANCOMOVIMIENTO (BancoCuenta,Fecha,Sentido,Importe,Origen,ChequeEvento,Usuario,CreadoEn,Observacion) VALUES (?,?,'INGRESO',?,'CHEQUE',?,?,?,?)",
          [
            account,
            input.Fecha,
            String(cheque.Importe),
            event,
            user,
            now,
            input.Observacion,
          ],
        );
        await auditChequeEvent(
          c,
          cheque,
          input,
          account,
          user,
          now,
          "ACREDITACION",
          "ACREDITADO",
        );
      }
      return {
        Cheques: input.Cheques,
        Fecha: input.Fecha,
        ImporteTotal: moneyText(
          cheques.reduce(
            (sum, cheque) => sum + moneyUnits(String(cheque.Importe)),
            0n,
          ),
        ),
      };
    });
}
