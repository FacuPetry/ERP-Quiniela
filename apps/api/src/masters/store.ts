import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  masterDefinitions,
  type MasterDefinition,
  type MasterDetail,
  type MasterKey,
  type MasterList,
  type MasterRecord,
} from "@erp/shared";
import { MasterRequestError, type ListQuery } from "./validation.js";

// Solo estos identificadores constantes se interpolan en SQL. Los datos siempre
// viajan como parámetros; el nombre solicitado por HTTP nunca se usa como tabla.
const tables: Record<MasterKey, string> = {
  "tipos-cliente": "CLIENTETIPO",
  clientes: "CLIENTE",
  conceptos: "CONCEPTO",
  cajas: "CAJA",
  bancos: "BANCO",
  "cuentas-bancarias": "BANCOCUENTA",
};
const tableName = (master: MasterDefinition) => "`" + tables[master.key] + "`";
const columns = (master: MasterDefinition) => [
  ...master.fields.map((field) => field.name),
  "Activo",
];
const projection = (master: MasterDefinition) =>
  columns(master)
    .map((name) => "`" + name + "`")
    .join(", ");
function record(row: RowDataPacket): MasterRecord {
  return {
    ...(Object.fromEntries(Object.entries(row)) as Record<
      string,
      string | null
    >),
    Codigo: String(row.Codigo),
    Activo: Boolean(row.Activo),
  };
}
function detail(row: MasterRecord): MasterDetail {
  return {
    registro: row,
    version: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
  };
}

async function nextClientCode(
  connection: Pool | PoolConnection,
): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT MAX(CAST(Codigo AS UNSIGNED)) AS ultimo FROM CLIENTE WHERE Codigo REGEXP '^[0-9]{1,5}$'",
  );
  const next = Number(rows[0]?.ultimo ?? 0) + 1;
  if (next > 99999)
    throw new MasterRequestError(
      409,
      "Se agotó la numeración de clientes de cinco dígitos.",
    );
  return String(next).padStart(5, "0");
}

export function createMasterStore(pool: Pool) {
  return {
    // Vista previa de lectura: no reserva ni bloquea un número.
    async suggestClientCode() {
      return { codigo: await nextClientCode(pool) };
    },
    async list(
      master: MasterDefinition,
      query: ListQuery,
    ): Promise<MasterList> {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (query.estado !== "todos") {
        clauses.push("Activo = ?");
        params.push(query.estado === "activo" ? 1 : 0);
      }
      if (query.q) {
        const fields = master.fields.filter(
          (field) => field.kind !== "textarea",
        );
        clauses.push(
          "(" +
            fields
              .map((field) => "`" + field.name + "` LIKE ? ESCAPE '!'")
              .join(" OR ") +
            ")",
        );
        params.push(
          ...fields.map(() => "%" + query.q.replace(/[!%_]/g, "!$&") + "%"),
        );
      }
      if (query.referencia !== undefined) {
        const relation = master.fields.find(
          (field) => field.kind === "relation",
        );
        if (!relation)
          throw new MasterRequestError(
            400,
            "Este maestro no tiene filtro de referencia.",
          );
        clauses.push("`" + relation.name + "` = ?");
        params.push(query.referencia);
      }
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
      const [count] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM " + tableName(master) + where,
        params,
      );
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${projection(master)} FROM ${tableName(master)}${where} ORDER BY Codigo LIMIT ? OFFSET ?`,
        [...params, query.limite, (query.pagina - 1) * query.limite],
      );
      return {
        registros: rows.map(record),
        total: Number(count[0]!.total),
        pagina: query.pagina,
        limite: query.limite,
      };
    },
    async get(master: MasterDefinition, code: string): Promise<MasterDetail> {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${projection(master)} FROM ${tableName(master)} WHERE Codigo = ?`,
        [code],
      );
      if (!rows[0])
        throw new MasterRequestError(
          404,
          "El registro ya no existe. Actualizá el listado.",
        );
      return detail(record(rows[0]));
    },
    async write(
      master: MasterDefinition,
      action: "ALTA" | "MODIFICACION" | "BAJA",
      input: MasterRecord | null,
      code: string,
      userId: string,
      version?: string,
    ): Promise<MasterDetail | null> {
      const connection = await pool.getConnection();
      let transaction = false;
      let allocationLock: string | null = null;
      let reusable = true;
      try {
        if (master.key === "clientes" && action === "ALTA" && input) {
          const [database] = await connection.query<RowDataPacket[]>(
            "SELECT DATABASE() AS name",
          );
          const name =
            "erp_cliente_" +
            createHash("sha256")
              .update(String(database[0]!.name))
              .digest("hex")
              .slice(0, 32);
          try {
            const [lock] = await connection.execute<RowDataPacket[]>(
              "SELECT GET_LOCK(?, 10) AS acquired",
              [name],
            );
            if (Number(lock[0]?.acquired) !== 1)
              throw new MasterRequestError(
                503,
                "No se pudo reservar el código de cliente. Intentá nuevamente en unos momentos.",
              );
            allocationLock = name;
          } catch (error) {
            // Si se perdió la respuesta, el servidor podría haber adquirido el
            // bloqueo. Cerrar la conexión impide devolverla bloqueada al pool.
            reusable = false;
            throw error;
          }
        }
        // GET_LOCK debe preceder a la transacción y a su primera lectura para
        // que MAX vea el alta confirmada por la conexión que nos antecedió.
        await connection.beginTransaction();
        transaction = true;
        if (allocationLock && input) {
          code = await nextClientCode(connection);
          input.Codigo = code;
        }
        let before: MasterRecord | null = null;
        if (action !== "ALTA") {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT ${projection(master)} FROM ${tableName(master)} WHERE Codigo = ? FOR UPDATE`,
            [code],
          );
          if (!rows[0])
            throw new MasterRequestError(
              404,
              "El registro ya no existe. Actualizá el listado.",
            );
          before = record(rows[0]);
          if (!version || detail(before).version !== version)
            throw new MasterRequestError(
              409,
              "El registro cambió desde que lo abriste. Volvé al listado y abrilo nuevamente para trabajar con la versión actual.",
            );
          if (input && input.Codigo !== before.Codigo)
            throw new MasterRequestError(
              400,
              "El código no puede modificarse.",
            );
        }
        if (input) {
          for (const field of master.fields) {
            if (!field.relation) continue;
            const related = masterDefinitions[field.relation];
            const [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT Codigo, Activo FROM ${tableName(related)} WHERE Codigo = ? LOCK IN SHARE MODE`,
              [input[field.name] ?? null],
            );
            if (!rows[0])
              throw new MasterRequestError(
                400,
                "Revisá los campos indicados.",
                { [field.name]: "La referencia seleccionada no existe." },
              );
            if (
              !Boolean(rows[0].Activo) &&
              before?.[field.name] !== rows[0].Codigo
            )
              throw new MasterRequestError(
                400,
                "Revisá los campos indicados.",
                { [field.name]: "Seleccioná un registro activo." },
              );
            input[field.name] = rows[0].Codigo;
          }
        }
        if (action === "ALTA" && input) {
          const fields = columns(master);
          await connection.execute(
            `INSERT INTO ${tableName(master)} (${projection(master)}) VALUES (${fields.map(() => "?").join(", ")})`,
            fields.map((field) => input[field] ?? null),
          );
        } else if (action === "MODIFICACION" && input) {
          const fields = columns(master).filter((field) => field !== "Codigo");
          await connection.execute(
            `UPDATE ${tableName(master)} SET ${fields.map((field) => "`" + field + "` = ?").join(", ")} WHERE Codigo = ?`,
            [...fields.map((field) => input[field] ?? null), code],
          );
        } else if (action === "BAJA")
          await connection.execute(
            `DELETE FROM ${tableName(master)} WHERE Codigo = ?`,
            [code],
          );
        const after = input ? { ...input } : null;
        await connection.execute(
          "INSERT INTO AUDITORIA (Usuario, Accion, Tabla, Registro, Fecha, Detalle) VALUES (?, ?, ?, ?, ?, ?)",
          [
            userId,
            action,
            tables[master.key],
            before?.Codigo ?? code,
            new Date(),
            JSON.stringify({ Antes: before, Despues: after }),
          ],
        );
        // Leer de nuevo devuelve el orden y la representación canónica de MySQL.
        let result: MasterDetail | null = null;
        if (after) {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT ${projection(master)} FROM ${tableName(master)} WHERE Codigo = ?`,
            [code],
          );
          result = detail(record(rows[0]!));
        }
        await connection.commit();
        transaction = false;
        return result;
      } catch (error) {
        if (transaction) {
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
            "Ya existe un registro con ese código.",
          );
        if (code === "ER_ROW_IS_REFERENCED_2")
          throw new MasterRequestError(
            409,
            "El registro está utilizado por otros datos y no puede eliminarse. Podés desactivarlo desde Modificar.",
          );
        if (code === "ER_NO_REFERENCED_ROW_2")
          throw new MasterRequestError(
            409,
            "Una referencia cambió. Actualizá los datos e intentá nuevamente.",
          );
        if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT")
          throw new MasterRequestError(
            409,
            "Otra operación está modificando estos datos. Intentá nuevamente.",
          );
        throw error;
      } finally {
        if (allocationLock && reusable) {
          try {
            const [released] = await connection.execute<RowDataPacket[]>(
              "SELECT RELEASE_LOCK(?) AS released",
              [allocationLock],
            );
            if (Number(released[0]?.released) !== 1) reusable = false;
          } catch {
            reusable = false;
          }
        }
        if (reusable) connection.release();
        else connection.destroy();
      }
    },
  };
}
export type MasterStore = ReturnType<typeof createMasterStore>;
