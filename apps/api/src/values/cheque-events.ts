import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { ChequeAccreditationInput } from "@erp/shared";
import { MasterRequestError } from "../masters/validation.js";

/** Bloqueo común para transiciones de custodia/cobranza. Las operaciones de
 * caja también bloquean CHEQUE antes de utilizar o corregir el instrumento. */
export async function lockCheques(
  c: PoolConnection,
  input: ChequeAccreditationInput,
  expected: "CARTERA" | "DEPOSITADO",
) {
  const cheques: RowDataPacket[] = [];
  for (const id of [...input.Cheques].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : 1,
  )) {
    const [rows] = await c.execute<RowDataPacket[]>(
      "SELECT *,DATE_FORMAT(Emision,'%Y-%m-%d') AS Emision FROM CHEQUE WHERE IDTabla=? FOR UPDATE",
      [id],
    );
    const cheque = rows[0];
    if (!cheque || cheque.Tipo !== "TERCERO" || cheque.Estado !== expected)
      throw new MasterRequestError(
        409,
        expected === "CARTERA"
          ? "Uno de los cheques ya no está disponible en cartera. Actualizá el listado y revisá la selección."
          : "Uno de los cheques ya no está pendiente de acreditación. Actualizá el listado y revisá la selección.",
      );
    const [dates] = await c.execute<RowDataPacket[]>(
      "SELECT DATE_FORMAT(GREATEST(?,COALESCE(MAX(Fecha),?)),'%Y-%m-%d') AS UltimaFecha FROM CHEQUEEVENTO WHERE Cheque=?",
      [cheque.Emision, cheque.Emision, id],
    );
    if (input.Fecha < String(dates[0]!.UltimaFecha))
      throw new MasterRequestError(
        400,
        expected === "CARTERA"
          ? "La fecha de depósito no puede ser anterior a la emisión ni al último evento del cheque."
          : "La fecha de acreditación no puede ser anterior al depósito ni al último evento del cheque.",
        { Fecha: "Revisá la fecha de la operación." },
      );
    cheques.push(cheque);
  }
  return cheques;
}

export async function activeChequeAccount(c: PoolConnection, code: string) {
  const [accounts] = await c.execute<RowDataPacket[]>(
    "SELECT bc.Codigo FROM BANCOCUENTA bc JOIN BANCO b ON b.Codigo=bc.Banco WHERE bc.Codigo=? AND bc.Activo=1 AND b.Activo=1 LOCK IN SHARE MODE",
    [code],
  );
  if (!accounts[0])
    throw new MasterRequestError(
      400,
      "La cuenta de destino y su banco deben estar activos. Revisá su configuración antes de continuar.",
      { BancoCuenta: "La cuenta de destino no está disponible." },
    );
}

export async function recordChequeEvent(
  c: PoolConnection,
  cheque: RowDataPacket,
  input: ChequeAccreditationInput,
  account: string,
  user: string,
  now: Date,
  type: "DEPOSITO" | "ACREDITACION",
  state: "DEPOSITADO" | "ACREDITADO",
) {
  await c.execute(
    "INSERT INTO CHEQUEEVENTO (Cheque,Tipo,Fecha,BancoCuenta,Usuario,CreadoEn,Observacion) VALUES (?,?,?,?,?,?,?)",
    [cheque.IDTabla, type, input.Fecha, account, user, now, input.Observacion],
  );
  const [ids] = await c.query<RowDataPacket[]>(
    "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
  );
  await c.execute("UPDATE CHEQUE SET Estado=? WHERE IDTabla=?", [
    state,
    cheque.IDTabla,
  ]);
  return String(ids[0]!.id);
}

export async function auditChequeEvent(
  c: PoolConnection,
  cheque: RowDataPacket,
  input: ChequeAccreditationInput,
  account: string,
  user: string,
  now: Date,
  action: string,
  state: string,
) {
  await c.execute(
    "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Detalle) VALUES (?,?,'CHEQUE',?,?,?)",
    [
      user,
      action,
      String(cheque.IDTabla),
      now,
      JSON.stringify({
        Antes: { Estado: cheque.Estado },
        Despues: { Estado: state },
        Fecha: input.Fecha,
        BancoCuenta: account,
        Importe: String(cheque.Importe),
        Observacion: input.Observacion,
      }),
    ],
  );
}
