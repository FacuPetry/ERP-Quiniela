import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  masterDefinitions,
  voucherParts,
  masterRecordKey,
  type MasterDefinition,
  type MasterDetail,
  type MasterKey,
  type MasterList,
  type MasterRecord,
} from "@erp/shared";
import { voucherLockName, lastVoucher } from "../database/voucher-sequence.js";
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
  comprobantes: "COMPROBANTE",
  numeraciones: "NUMERACION",
};
const tableName = (master: MasterDefinition) => "`" + tables[master.key] + "`";
const primaryKey = (master: MasterDefinition) => master.primaryKey ?? "Codigo";
const columns = (master: MasterDefinition) => [
  ...master.fields.map((field) => field.name),
  "Activo",
];
const projection = (master: MasterDefinition, prefix = "") =>
  columns(master)
    .map((name) => prefix + "`" + name + "`")
    .join(", ");
function record(row: RowDataPacket): MasterRecord {
  return {
    ...(Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value == null ? null : String(value),
      ]),
    ) as Record<string, string | null>),
    Activo: Boolean(row.Activo),
  };
}
function detail(row: MasterRecord): MasterDetail {
  return {
    registro: row,
    version: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
  };
}

async function recordDetail(
  _connection: Pool | PoolConnection,
  _master: MasterDefinition,
  row: MasterRecord,
): Promise<MasterDetail> {
  return detail(row);
}

function checkIdentity(master: MasterDefinition, key: string) {
  if (
    master.primaryKey === "IDTabla" &&
    (!/^[1-9][0-9]{0,18}$/.test(key) || BigInt(key) > 9223372036854775807n)
  )
    throw new MasterRequestError(400, "Identificador inválido.");
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
      const relations = master.fields.flatMap((field, index) => {
        if (!field.relation || !field.relationLabelField) return [];
        const related = masterDefinitions[field.relation];
        const label = related.fields.find(
          (candidate) => candidate.name === field.relationLabelField,
        );
        if (!label)
          throw new Error("Campo de descripción relacionado no definido.");
        return [
          {
            field,
            related,
            label,
            alias: `referencia_${index}`,
            result: `__referencia_${index}`,
          },
        ];
      });
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (query.estado !== "todos") {
        clauses.push("principal.Activo = ?");
        params.push(query.estado === "activo" ? 1 : 0);
      }
      if (query.q) {
        const fields = master.fields.filter(
          (field) => field.kind !== "textarea",
        );
        clauses.push(
          "(" +
            fields
              .map(
                (field) => "principal.`" + field.name + "` LIKE ? ESCAPE '!'",
              )
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
        clauses.push("principal.`" + relation.name + "` = ?");
        params.push(query.referencia);
      }
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
      const [count] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM " +
          tableName(master) +
          " AS principal" +
          where,
        params,
      );
      const labels = relations.map(
        ({ alias, label, result }) =>
          `${alias}.\`${label.name}\` AS \`${result}\``,
      );
      const joins = relations
        .map(
          ({ field, related, alias }) =>
            ` LEFT JOIN ${tableName(related)} AS ${alias} ON ${alias}.Codigo = principal.\`${field.name}\``,
        )
        .join("");
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${[projection(master, "principal."), ...labels].join(", ")} FROM ${tableName(master)} AS principal${joins}${where} ORDER BY principal.\`${primaryKey(master)}\` LIMIT ? OFFSET ?`,
        [...params, query.limite, (query.pagina - 1) * query.limite],
      );
      const descriptions = new Map(
        relations.map(({ field }) => [field.name, new Map<string, string>()]),
      );
      const registros = rows.map((row) => {
        const item = record(row);
        for (const { field, result } of relations) {
          delete item[result];
          const code = item[field.name];
          if (typeof code === "string" && row[result] != null)
            descriptions.get(field.name)!.set(code, String(row[result]));
        }
        return item;
      });
      return {
        registros,
        total: Number(count[0]!.total),
        pagina: query.pagina,
        limite: query.limite,
        ...(relations.length
          ? {
              descripciones: Object.fromEntries(
                [...descriptions].map(([field, values]) => [
                  field,
                  Object.fromEntries(values),
                ]),
              ),
            }
          : {}),
      };
    },
    async get(master: MasterDefinition, code: string): Promise<MasterDetail> {
      checkIdentity(master, code);
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${projection(master)} FROM ${tableName(master)} WHERE \`${primaryKey(master)}\` = ?`,
        [code],
      );
      if (!rows[0])
        throw new MasterRequestError(
          404,
          "El registro ya no existe. Actualizá el listado.",
        );
      return recordDetail(pool, master, record(rows[0]));
    },
    async write(
      master: MasterDefinition,
      action: "ALTA" | "MODIFICACION" | "BAJA",
      input: MasterRecord | null,
      code: string,
      userId: string,
      version?: string,
    ): Promise<MasterDetail | null> {
      if (action !== "ALTA") checkIdentity(master, code);
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
        if (master.key === "numeraciones" && input && action !== "BAJA") {
          const [related] = await connection.execute<RowDataPacket[]>(
            "SELECT Codigo FROM COMPROBANTE WHERE Codigo = ?",
            [input.Comprobante ?? null],
          );
          if (!related[0])
            throw new MasterRequestError(
              400,
              "El comprobante seleccionado no existe.",
            );
          input.Comprobante = String(related[0].Codigo);
          const [database] = await connection.query<RowDataPacket[]>(
            "SELECT DATABASE() AS name",
          );
          const name = voucherLockName(
            String(database[0]!.name),
            JSON.stringify([
              input.Comprobante,
              voucherParts(String(input.ProximoNumero)).point,
            ]),
          );
          try {
            const [rows] = await connection.execute<RowDataPacket[]>(
              "SELECT GET_LOCK(?, 10) AS acquired",
              [name],
            );
            if (Number(rows[0]?.acquired) !== 1)
              throw new MasterRequestError(
                503,
                "Otra operación está utilizando esta numeración. Reintentá.",
              );
            allocationLock = name;
          } catch (error) {
            reusable = false;
            throw error;
          }
        }
        // GET_LOCK debe preceder a la transacción y a su primera lectura para
        // que MAX vea el alta confirmada por la conexión que nos antecedió.
        await connection.beginTransaction();
        transaction = true;
        if (allocationLock && input && master.key === "clientes") {
          code = await nextClientCode(connection);
          input.Codigo = code;
        }
        let before: MasterRecord | null = null;
        if (action !== "ALTA") {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT ${projection(master)} FROM ${tableName(master)} WHERE \`${primaryKey(master)}\` = ? FOR UPDATE`,
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
          if (
            input &&
            masterRecordKey(master, input) !== masterRecordKey(master, before)
          )
            throw new MasterRequestError(
              400,
              master.primaryKey === "IDTabla"
                ? "El identificador no puede modificarse."
                : "El código no puede modificarse.",
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
        if (master.key === "numeraciones" && input?.Activo) {
          const last = await lastVoucher(
            connection,
            String(input.Comprobante),
            String(input.ProximoNumero),
          );
          if (last !== null && BigInt(String(input.ProximoNumero)) <= last)
            throw new MasterRequestError(409, "Revisá el próximo número.", {
              ProximoNumero:
                "Debe superar " +
                last +
                " dentro del punto de venta configurado, incluidos los anulados.",
            });
        }
        if (action === "ALTA" && input) {
          const fields = columns(master).filter((field) => field !== "IDTabla");
          await connection.execute(
            `INSERT INTO ${tableName(master)} (${fields.map((field) => "`" + field + "`").join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
            fields.map((field) => input[field] ?? null),
          );
          if (master.primaryKey === "IDTabla") {
            const [rows] = await connection.query<RowDataPacket[]>(
              "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
            );
            code = String(rows[0]!.id);
            input.IDTabla = code;
          }
        } else if (action === "MODIFICACION" && input) {
          const fields = columns(master).filter(
            (field) => field !== primaryKey(master),
          );
          await connection.execute(
            `UPDATE ${tableName(master)} SET ${fields.map((field) => "`" + field + "` = ?").join(", ")} WHERE \`${primaryKey(master)}\` = ?`,
            [...fields.map((field) => input[field] ?? null), code],
          );
        } else if (action === "BAJA")
          await connection.execute(
            `DELETE FROM ${tableName(master)} WHERE \`${primaryKey(master)}\` = ?`,
            [code],
          );
        const after = input ? { ...input } : null;
        await connection.execute(
          "INSERT INTO AUDITORIA (Usuario, Accion, Tabla, Registro, Fecha, Detalle) VALUES (?, ?, ?, ?, ?, ?)",
          [
            userId,
            action,
            tables[master.key],
            before ? masterRecordKey(master, before) : code,
            new Date(),
            JSON.stringify({ Antes: before, Despues: after }),
          ],
        );
        // Leer de nuevo devuelve el orden y la representación canónica de MySQL.
        let result: MasterDetail | null = null;
        if (after) {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT ${projection(master)} FROM ${tableName(master)} WHERE \`${primaryKey(master)}\` = ?`,
            [code],
          );
          result = await recordDetail(connection, master, record(rows[0]!));
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
            master.key === "numeraciones"
              ? "Ya existe un numerador para ese comprobante."
              : "Ya existe un registro con ese código.",
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
