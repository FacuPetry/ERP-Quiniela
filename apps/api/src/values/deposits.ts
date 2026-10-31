import type { Pool } from "mysql2/promise";
import {
  moneyText,
  moneyUnits,
  type ChequeDepositInput,
  type ChequeDepositResult,
} from "@erp/shared";
import { financialTransactions } from "../database/financial-transaction.js";
import {
  activeChequeAccount,
  auditChequeEvent,
  lockCheques,
  recordChequeEvent,
} from "./cheque-events.js";

/** El depósito cambia la custodia; no genera una acreditación bancaria. */
export function chequeDeposits(pool: Pool) {
  const transaction = financialTransactions(pool, true);
  return (
    input: ChequeDepositInput,
    user: string,
    key: string,
  ): Promise<ChequeDepositResult> =>
    transaction(user, "VALORES_DEPOSITO", key, input, async (c) => {
      const cheques = await lockCheques(c, input, "CARTERA");
      await activeChequeAccount(c, input.BancoCuenta);
      const now = new Date();
      for (const cheque of cheques) {
        await recordChequeEvent(
          c,
          cheque,
          input,
          input.BancoCuenta,
          user,
          now,
          "DEPOSITO",
          "DEPOSITADO",
        );
        await auditChequeEvent(
          c,
          cheque,
          input,
          input.BancoCuenta,
          user,
          now,
          "DEPOSITO",
          "DEPOSITADO",
        );
      }
      return {
        Cheques: input.Cheques,
        BancoCuenta: input.BancoCuenta,
        Fecha: input.Fecha,
        ImporteTotal: moneyText(
          cheques.reduce(
            (total, cheque) => total + moneyUnits(String(cheque.Importe)),
            0n,
          ),
        ),
      };
    });
}
