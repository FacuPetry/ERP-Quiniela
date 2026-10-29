import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  moneyText,
  moneyUnits,
  type ChequeDepositInput,
  type ChequeDepositResult,
} from "@erp/shared";
import { financialTransactions } from "../database/financial-transaction.js";
import { MasterRequestError } from "../masters/validation.js";

/** El depósito cambia la custodia del instrumento; la acreditación bancaria
 * se registrará por separado. No modifica caja, cuenta corriente ni BancoCuenta
 * del cheque (que identifica la cuenta libradora en los cheques propios). */
export function chequeDeposits(pool: Pool) {
  const transaction = financialTransactions(pool, true);
  return (
    input: ChequeDepositInput,
    user: string,
    key: string,
  ): Promise<ChequeDepositResult> =>
    transaction(user, "VALORES_DEPOSITO", key, input, async (c) => {
      // Orden estable de bloqueo entre lotes. Endosos/anulaciones/reversiones
      // también bloquean CHEQUE y revalidan su estado antes de escribir.
      const cheques: RowDataPacket[] = [];
      for (const id of input.Cheques) {
        const [rows] = await c.execute<RowDataPacket[]>(
          "SELECT *,DATE_FORMAT(Emision,'%Y-%m-%d') AS Emision FROM CHEQUE WHERE IDTabla=? FOR UPDATE",
          [id],
        );
        const cheque = rows[0];
        if (!cheque || cheque.Tipo !== "TERCERO" || cheque.Estado !== "CARTERA")
          throw new MasterRequestError(
            409,
            "Uno de los cheques ya no está disponible en cartera. Actualizá el listado y revisá la selección.",
          );
        const [dates] = await c.execute<RowDataPacket[]>(
          "SELECT DATE_FORMAT(GREATEST(?,COALESCE(MAX(Fecha),?)),'%Y-%m-%d') AS UltimaFecha FROM CHEQUEEVENTO WHERE Cheque=?",
          [cheque.Emision, cheque.Emision, id],
        );
        if (input.Fecha < String(dates[0]!.UltimaFecha))
          throw new MasterRequestError(
            400,
            "La fecha de depósito no puede ser anterior a la emisión ni al último evento del cheque.",
            { Fecha: "Revisá la fecha del depósito." },
          );
        cheques.push(cheque);
      }
      const [accounts] = await c.execute<RowDataPacket[]>(
        "SELECT bc.Codigo FROM BANCOCUENTA bc JOIN BANCO b ON b.Codigo=bc.Banco WHERE bc.Codigo=? AND bc.Activo=1 AND b.Activo=1 LOCK IN SHARE MODE",
        [input.BancoCuenta],
      );
      if (!accounts[0])
        throw new MasterRequestError(
          400,
          "Seleccioná una cuenta propia y un banco activos.",
          { BancoCuenta: "La cuenta de destino no está disponible." },
        );
      const now = new Date();
      for (const cheque of cheques) {
        await c.execute(
          "INSERT INTO CHEQUEEVENTO (Cheque,Tipo,Fecha,BancoCuenta,Usuario,CreadoEn,Observacion) VALUES (?,'DEPOSITO',?,?,?,?,?)",
          [
            cheque.IDTabla,
            input.Fecha,
            input.BancoCuenta,
            user,
            now,
            input.Observacion,
          ],
        );
        await c.execute(
          "UPDATE CHEQUE SET Estado='DEPOSITADO' WHERE IDTabla=?",
          [cheque.IDTabla],
        );
        await c.execute(
          "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Detalle) VALUES (?,'DEPOSITO','CHEQUE',?,?,?)",
          [
            user,
            String(cheque.IDTabla),
            now,
            JSON.stringify({
              Antes: { Estado: "CARTERA" },
              Despues: { Estado: "DEPOSITADO" },
              Fecha: input.Fecha,
              BancoCuenta: input.BancoCuenta,
              Importe: String(cheque.Importe),
              Observacion: input.Observacion,
            }),
          ],
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
