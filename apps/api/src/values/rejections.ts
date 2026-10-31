import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  formatVoucher,
  moneyText,
  moneyUnits,
  voucherParts,
  type ChequeRejectionInput,
  type ChequeRejectionPreview,
  type ChequeRejectionResult,
} from "@erp/shared";
import { financialTransactions } from "../database/financial-transaction.js";
import { issueNumber } from "../database/numbering.js";
import { MasterRequestError } from "../masters/validation.js";
import { activeChequeAccount, recordChequeEvent } from "./cheque-events.js";

type Conn = Pool | PoolConnection;
const fail = (message: string): never => {
  throw new MasterRequestError(409, message);
};
async function inspect(c: Conn, id: string) {
  const [rows] = await c.execute<RowDataPacket[]>(
    `
    SELECT ch.IDTabla,ch.Numero,ch.Tipo,ch.Estado,ch.Importe,DATE_FORMAT(ch.Emision,'%Y-%m-%d') AS Emision,
      e.IDTabla AS Evento,e.Tipo AS EventoTipo,e.BancoCuenta,bc.Nombre AS CuentaNombre,
      (SELECT DATE_FORMAT(MAX(x.Fecha),'%Y-%m-%d') FROM CHEQUEEVENTO x WHERE x.Cheque=ch.IDTabla) AS UltimaFecha,
      m.IDTabla AS Origen,m.Estado AS OrigenEstado,m.Sentido,m.CajaMovimientoOrigen,m.Cliente AS OrigenCliente,m.ImporteTotal,
      cc.IDTabla AS Credito,cc.Cliente,cl.Nombre AS ClienteNombre,cc.Cuenta,cc.Naturaleza,cc.Estado AS CreditoEstado,cc.Importe AS ImporteCredito,
      COALESCE((SELECT SUM(a.Importe) FROM CAJAMOVIMIENTOAFECTACION a WHERE a.CajaMovimiento=m.IDTabla),0) AS Aplicado,
      EXISTS(SELECT 1 FROM CAJAMOVIMIENTO r WHERE r.CajaMovimientoOrigen=m.IDTabla AND r.Estado='CONFIRMADO') AS Revertido
    FROM CHEQUE ch
    LEFT JOIN CHEQUEEVENTO e ON e.IDTabla=(SELECT MAX(x.IDTabla) FROM CHEQUEEVENTO x WHERE x.Cheque=ch.IDTabla)
    LEFT JOIN BANCOCUENTA bc ON bc.Codigo=e.BancoCuenta
    LEFT JOIN CHEQUEEVENTO first_e ON first_e.IDTabla=(SELECT MIN(x.IDTabla) FROM CHEQUEEVENTO x WHERE x.Cheque=ch.IDTabla AND x.Tipo='RECEPCION')
    LEFT JOIN CAJAMOVIMIENTO m ON m.IDTabla=first_e.CajaMovimiento
    LEFT JOIN CUENTACORRIENTE cc ON cc.CajaMovimiento=m.IDTabla LEFT JOIN CLIENTE cl ON cl.Codigo=cc.Cliente
    WHERE ch.IDTabla=?`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new MasterRequestError(404, "El cheque no existe.");
  if (
    r.Tipo !== "TERCERO" ||
    !["DEPOSITADO", "ACREDITADO"].includes(String(r.Estado))
  )
    fail(
      "Solo se pueden rechazar cheques de terceros depositados o acreditados. Actualizá el listado.",
    );
  if (
    r.EventoTipo !==
      (r.Estado === "ACREDITADO" ? "ACREDITACION" : "DEPOSITO") ||
    !r.BancoCuenta
  )
    fail(
      "El cheque no tiene un último evento compatible con su estado y cuenta de destino.",
    );
  if (
    !r.Origen ||
    !r.Credito ||
    r.OrigenEstado !== "CONFIRMADO" ||
    r.CreditoEstado !== "CONFIRMADO" ||
    r.CajaMovimientoOrigen ||
    Number(r.Revertido) ||
    r.Cuenta !== "COBRAR" ||
    r.Naturaleza !== "CREDITO" ||
    r.Sentido !== "INGRESO" ||
    r.Cliente !== r.OrigenCliente ||
    moneyUnits(String(r.ImporteCredito)) !== moneyUnits(String(r.ImporteTotal))
  )
    fail(
      "No se pudo identificar un cobro vigente y su crédito original. Revisá las operaciones relacionadas.",
    );
  const available =
    moneyUnits(String(r.ImporteTotal)) - moneyUnits(String(r.Aplicado));
  if (available < 0n)
    fail(
      "Las afectaciones del cobro superan su importe. Revisá sus operaciones relacionadas.",
    );
  const amount = moneyUnits(String(r.Importe));
  const compensated = moneyText(available < amount ? available : amount);
  const signature = { ...r, ClienteNombre: undefined, CuentaNombre: undefined };
  const version = createHash("sha256")
    .update(JSON.stringify(signature))
    .digest("hex");
  const preview: ChequeRejectionPreview = {
    Cheque: id,
    Numero: String(r.Numero),
    Estado: String(r.Estado),
    Cliente: String(r.Cliente),
    ClienteNombre: String(r.ClienteNombre),
    Importe: String(r.Importe),
    CuentaNombre: String(r.CuentaNombre),
    CompensableACuenta: compensated,
    version,
  };
  return { row: r, preview };
}

export function chequeRejections(pool: Pool) {
  const transaction = financialTransactions(pool, true);
  return {
    async preview(id: string): Promise<ChequeRejectionPreview> {
      const c = await pool.getConnection();
      try {
        await c.query("START TRANSACTION READ ONLY");
        const { preview } = await inspect(c, id);
        await c.commit();
        return preview;
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
    async reject(
      id: string,
      input: ChequeRejectionInput,
      version: string,
      user: string,
      key: string,
    ): Promise<ChequeRejectionResult> {
      const [vouchers] = await pool.execute<RowDataPacket[]>(
        "SELECT Codigo FROM COMPROBANTE WHERE Codigo=?",
        [input.Comprobante],
      );
      if (!vouchers[0])
        throw new MasterRequestError(400, "El comprobante no existe.");
      const code = String(vouchers[0].Codigo);
      return transaction(
        user,
        "VALORES_RECHAZO",
        key,
        {
          id,
          version,
          ...input,
          Comprobante: code,
          NumeroComprobante: input.NumeroAutomatico
            ? "0"
            : input.NumeroComprobante,
        },
        async (c) => {
          // Mismo orden que las correcciones de Caja: comprobante/numerador,
          // movimiento original, crédito original, cheque. La caja cerrada no se toca.
          const [v] = await c.execute<RowDataPacket[]>(
            "SELECT Codigo FROM COMPROBANTE WHERE Codigo=? AND Activo=1 AND EsReversion=0 AND ModuloOrigen='CUENTACORRIENTE' AND Cuenta='COBRAR' AND Naturaleza='DEUDA' AND SentidoFondos='NOAPLICA' FOR UPDATE",
            [code],
          );
          if (!v[0])
            throw new MasterRequestError(
              400,
              "Seleccioná un comprobante activo de Cuenta corriente: Cobrar / Deuda / No aplica.",
              {
                Comprobante:
                  "Configuración incompatible con la deuda del rechazo.",
              },
            );
          const number = await issueNumber(
            c,
            code,
            input.NumeroComprobante,
            "CUENTACORRIENTE",
            undefined,
            false,
            input.NumeroAutomatico,
          );
          const original = await inspect(c, id);
          await c.execute(
            "SELECT IDTabla FROM CAJAMOVIMIENTO WHERE IDTabla=? FOR UPDATE",
            [original.row.Origen],
          );
          await c.execute(
            "SELECT IDTabla FROM CUENTACORRIENTE WHERE IDTabla=? FOR UPDATE",
            [original.row.Credito],
          );
          await c.execute(
            "SELECT IDTabla FROM CHEQUE WHERE IDTabla=? FOR UPDATE",
            [id],
          );
          const { row: cheque, preview } = await inspect(c, id);
          if (preview.version !== version)
            fail(
              "El cheque o el disponible a cuenta cambiaron. Actualizá los datos del rechazo antes de confirmar.",
            );
          if (
            input.Fecha < String(cheque.UltimaFecha) ||
            input.Fecha < String(cheque.Emision)
          )
            throw new MasterRequestError(
              400,
              "La fecha de rechazo no puede ser anterior al último evento del cheque.",
              { Fecha: "Revisá la fecha de rechazo." },
            );
          const credited = cheque.Estado === "ACREDITADO";
          if (
            credited &&
            (!input.ConfirmarDebitoBancario || !input.FechaDebito)
          )
            throw new MasterRequestError(
              400,
              "Confirmá que el banco debitó el importe e indicá la fecha real del débito.",
            );
          if (!credited && (input.ConfirmarDebitoBancario || input.FechaDebito))
            throw new MasterRequestError(
              400,
              "Un cheque sin acreditar no debe generar un débito bancario.",
            );
          const [bank] = await c.execute<RowDataPacket[]>(
            "SELECT bm.*,DATE_FORMAT(bm.Fecha,'%Y-%m-%d') AS Dia,e.Tipo AS EventoTipo FROM BANCOMOVIMIENTO bm JOIN CHEQUEEVENTO e ON e.IDTabla=bm.ChequeEvento WHERE e.Cheque=? ORDER BY bm.IDTabla",
            [id],
          );
          if (
            (!credited && bank.length) ||
            (credited &&
              (bank.length !== 1 ||
                bank[0]!.EventoTipo !== "ACREDITACION" ||
                String(bank[0]!.ChequeEvento) !== String(cheque.Evento) ||
                bank[0]!.Sentido !== "INGRESO" ||
                bank[0]!.BancoCuenta !== cheque.BancoCuenta ||
                moneyUnits(String(bank[0]!.Importe)) !==
                  moneyUnits(preview.Importe)))
          )
            fail(
              "Los movimientos bancarios del cheque no corresponden con su estado. Revisá el historial.",
            );
          if (credited && input.FechaDebito! < String(bank[0]!.Dia))
            throw new MasterRequestError(
              400,
              "El débito no puede ser anterior a la acreditación.",
              { FechaDebito: "Revisá la fecha del débito bancario." },
            );
          await activeChequeAccount(c, String(cheque.BancoCuenta));
          const now = new Date();
          const event = await recordChequeEvent(
            c,
            cheque,
            { Cheques: [id], Fecha: input.Fecha, Observacion: input.Motivo },
            String(cheque.BancoCuenta),
            user,
            now,
            "RECHAZO",
            "RECHAZADO",
          );
          if (credited)
            await c.execute(
              "INSERT INTO BANCOMOVIMIENTO (BancoCuenta,Fecha,Sentido,Importe,Origen,ChequeEvento,Usuario,CreadoEn,Observacion) VALUES (?,?,'EGRESO',?,'CHEQUE',?,?,?,?)",
              [
                cheque.BancoCuenta,
                input.FechaDebito,
                preview.Importe,
                event,
                user,
                now,
                input.Motivo,
              ],
            );
          await c.execute(
            "INSERT INTO CUENTACORRIENTE (Cliente,Comprobante,ChequeEvento,NumeroComprobante,FechaOrigen,Vencimiento,Cuenta,Naturaleza,Importe,Observacion,Estado,Usuario,CreadoEn) VALUES (?,?,?,?,?,?,'COBRAR','DEUDA',?,?,'CONFIRMADO',?,?)",
            [
              preview.Cliente,
              code,
              event,
              number,
              input.Fecha,
              input.Fecha,
              preview.Importe,
              input.Motivo,
              user,
              now,
            ],
          );
          const [ids] = await c.query<RowDataPacket[]>(
            "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
          );
          const debt = String(ids[0]!.id);
          // Compensar solo el remanente aún disponible del recibo evita dejar un
          // anticipo utilizable junto a la deuda del mismo cheque rechazado.
          if (moneyUnits(preview.CompensableACuenta) > 0n)
            await c.execute(
              "INSERT INTO CAJAMOVIMIENTOAFECTACION (CajaMovimiento,CuentaCorriente,Importe,CreadoEn,Usuario) VALUES (?,?,?,?,?)",
              [cheque.Origen, debt, preview.CompensableACuenta, now, user],
            );
          const result: ChequeRejectionResult = {
            Cheque: id,
            CuentaCorriente: debt,
            NumeroDeuda: formatVoucher(number),
            Importe: preview.Importe,
            CompensadoACuenta: preview.CompensableACuenta,
            Pendiente: moneyText(
              moneyUnits(preview.Importe) -
                moneyUnits(preview.CompensableACuenta),
            ),
          };
          const detail = {
            ...result,
            CajaMovimientoOrigen: String(cheque.Origen),
            ChequeEvento: event,
            Comprobante: code,
            Fecha: input.Fecha,
            BancoCuenta: String(cheque.BancoCuenta),
            FechaDebito: input.FechaDebito,
            Antes: preview.Estado,
            Despues: "RECHAZADO",
            ConfirmarDebitoBancario: input.ConfirmarDebitoBancario,
          };
          for (const [table, record, action] of [
            ["CHEQUE", id, "RECHAZO"],
            ["CUENTACORRIENTE", debt, "ALTA_DESDE_RECHAZO"],
          ] as const)
            await c.execute(
              "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Motivo,Detalle) VALUES (?,?,?,?,?,?,?)",
              [
                user,
                action,
                table,
                record,
                now,
                input.Motivo,
                JSON.stringify(detail),
              ],
            );
          return result;
        },
        JSON.stringify([code, voucherParts(input.NumeroComprobante).point]),
      );
    },
  };
}
