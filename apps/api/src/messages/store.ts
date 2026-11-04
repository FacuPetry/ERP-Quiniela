import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  type BalanceMessagePreview,
  type MessageTemplatePreference,
  type ClientMessagesResult,
} from "@erp/shared";
import { ledgerEntries, readLedgerBalance } from "../reports/ledger.js";
import { MasterRequestError } from "../masters/validation.js";
import { messageBalanceDate } from "./text.js";
import { prepareClientMessage } from "./preview.js";
import { listOrder } from "../database/list-order.js";
import type {
  MessageClientsQuery,
  SelectedMessageClients,
} from "./validation.js";

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
async function clientMessages(
  pool: Pool,
  q: MessageClientsQuery,
  user: string,
  now: Date,
  selected?: string[],
): Promise<ClientMessagesResult> {
  const FechaHasta = messageBalanceDate(now),
    consultadoEn = now.toISOString();
  const order = listOrder(
    q,
    {
      Cliente: "cl.Codigo",
      ClienteNombre: "cl.Nombre",
      Telefono: "cl.Telefono",
      SaldoTotal: "COALESCE(s.SaldoTotal,0)",
    },
    "cl.Codigo",
  );
  const conditions: string[] = [],
    params: string[] = [FechaHasta];
  if (selected) {
    conditions.push(`cl.Codigo IN (${selected.map(() => "?").join(",")})`);
    params.push(...selected);
  } else {
    if (q.Estado !== "TODOS")
      conditions.push(q.Estado === "ACTIVOS" ? "cl.Activo=1" : "cl.Activo=0");
    if (q.ClienteTipo) {
      conditions.push("cl.ClienteTipo=?");
      params.push(q.ClienteTipo);
    }
    if (q.q) {
      conditions.push(
        "(cl.Codigo LIKE ? ESCAPE '!' OR cl.Nombre LIKE ? ESCAPE '!' OR cl.Fantasia LIKE ? ESCAPE '!')",
      );
      params.push(
        ...Array<string>(3).fill("%" + q.q.replace(/[!%_]/g, "!$&") + "%"),
      );
    }
    const balance = {
      POSITIVO: ">0",
      A_FAVOR: "<0",
      CERO: "=0",
      NO_CERO: "<>0",
      TODOS: "",
    }[q.Saldo];
    if (balance) conditions.push("COALESCE(s.SaldoTotal,0)" + balance);
  }
  // La misma fuente monetaria del Resumen; una fila por asiento, sin sumar
  // afectaciones/valores otra vez. Agregar antes de paginar o filtrar por saldo.
  const from = `FROM CLIENTE cl LEFT JOIN (
    SELECT l.Cliente,SUM(l.Debito-l.Credito) AS SaldoTotal FROM (${ledgerEntries}) l
    WHERE l.FechaOrden<=? GROUP BY l.Cliente
  ) s ON s.Cliente=cl.Codigo${conditions.length ? " WHERE " + conditions.join(" AND ") : ""}`;
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION READ ONLY");
    const config = await preference(c, user);
    const [totals] = await c.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total ${from}`,
      params,
    );
    const total = Number(totals[0]!.total);
    if (selected && total !== selected.length)
      throw new MasterRequestError(
        409,
        "Algún cliente seleccionado ya no existe. Volvé a consultar la lista.",
      );
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT cl.Codigo,cl.Nombre,cl.Fantasia,cl.Telefono,COALESCE(s.SaldoTotal,0) AS SaldoTotal ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, q.limite, (q.pagina - 1) * q.limite],
    );
    const registros = rows.map((r) =>
      prepareClientMessage(
        {
          Codigo: String(r.Codigo),
          Nombre: String(r.Nombre),
          Fantasia: r.Fantasia == null ? null : String(r.Fantasia),
          Telefono: r.Telefono == null ? null : String(r.Telefono),
          SaldoTotal: String(r.SaldoTotal),
        },
        FechaHasta,
        consultadoEn,
        config.Plantilla,
      ),
    );
    await c.commit();
    return {
      registros,
      total,
      pagina: q.pagina,
      limite: q.limite,
      FechaHasta,
      consultadoEn,
    };
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
export function createMessageStore(pool: Pool, now = () => new Date()) {
  return {
    clients: (q: MessageClientsQuery, user: string) =>
      clientMessages(pool, q, user, now()),
    selectedClients: (q: SelectedMessageClients, user: string) =>
      clientMessages(
        pool,
        { ...q, q: "", Estado: "TODOS", Saldo: "TODOS" },
        user,
        now(),
        q.Clientes,
      ),
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
          "SELECT Telefono,Fantasia FROM CLIENTE WHERE Codigo=?",
          [Cliente],
        );
        const Telefono =
          phones[0]?.Telefono == null ? null : String(phones[0].Telefono);
        const SaldoTotal = String(total.SaldoFinal);
        const ClienteNombre = String(client.Nombre);
        const { ErrorMensaje, ...record } = prepareClientMessage(
          {
            Codigo: String(client.Codigo),
            Nombre: ClienteNombre,
            SaldoTotal,
            Fantasia:
              phones[0]?.Fantasia == null ? null : String(phones[0].Fantasia),
            Telefono,
          },
          FechaHasta,
          consulted.toISOString(),
          config.Plantilla,
        );
        if (ErrorMensaje) throw new MasterRequestError(400, ErrorMensaje);
        await c.commit();
        return record;
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
