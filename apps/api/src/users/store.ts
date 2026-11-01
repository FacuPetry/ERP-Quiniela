import { createHash } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { UserDetail, UserInput, UserList, UserRecord } from "@erp/shared";
import { hashPassword } from "../auth/crypto.js";
import { storedPermissions } from "../auth/store.js";
import { MasterRequestError } from "../masters/validation.js";
import { listOrder, type ListOrderQuery } from "../database/list-order.js";
const projection =
  "IDTabla,Nombre,Email,Rol,Activo,Permisos,CreadoEn,ClaveHash";
function record(r: RowDataPacket): UserRecord {
  return {
    id: String(r.IDTabla),
    nombre: String(r.Nombre),
    email: String(r.Email),
    activo: Boolean(r.Activo),
    administrador: r.Rol === "ADMIN",
    permisos: storedPermissions(r.Permisos, String(r.Rol)),
    creadoEn:
      r.CreadoEn instanceof Date
        ? r.CreadoEn.toISOString()
        : String(r.CreadoEn),
  };
}
function detail(r: RowDataPacket): UserDetail {
  const registro = record(r);
  return {
    registro,
    version: createHash("sha256")
      .update(JSON.stringify([registro, r.ClaveHash, r.Rol]))
      .digest("hex"),
  };
}
async function read(c: Pool | PoolConnection, id: string, lock = false) {
  const [rows] = await c.execute<RowDataPacket[]>(
    `SELECT ${projection} FROM USUARIO WHERE IDTabla=?${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows[0]) throw new MasterRequestError(404, "El usuario no existe.");
  return detail(rows[0]);
}
export function createUserStore(pool: Pool) {
  async function mutation<T>(
    actor: string,
    run: (c: PoolConnection) => Promise<T>,
  ) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const [admin] = await c.execute<RowDataPacket[]>(
        "SELECT u.IDTabla FROM USUARIO u JOIN ROL r ON r.Codigo=u.Rol WHERE u.IDTabla=? AND u.Rol='ADMIN' AND u.Activo=1 AND r.Activo=1 FOR UPDATE",
        [actor],
      );
      if (!admin.length)
        throw new MasterRequestError(
          403,
          "El administrador ya no está habilitado.",
        );
      const result = await run(c);
      await c.commit();
      return result;
    } catch (e) {
      await c.rollback();
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw new MasterRequestError(
          409,
          "Ya existe un usuario con ese correo.",
          { email: "El correo ya está registrado." },
        );
      throw e;
    } finally {
      c.release();
    }
  }
  async function audit(
    c: PoolConnection,
    actor: string,
    action: string,
    id: string,
    data: unknown,
  ) {
    await c.execute(
      "INSERT INTO AUDITORIA (Usuario,Accion,Tabla,Registro,Fecha,Detalle) VALUES (?,?,'USUARIO',?,?,?)",
      [actor, action, id, new Date(), JSON.stringify(data)],
    );
  }
  async function revoke(c: PoolConnection, id: string) {
    await c.execute(
      "UPDATE SESION SET RevocadoEn=? WHERE Usuario=? AND RevocadoEn IS NULL",
      [new Date(), id],
    );
  }
  return {
    get: (id: string) => read(pool, id),
    async list(
      q: ListOrderQuery & {
        q: string;
        estado: string;
        pagina: number;
        limite: number;
      },
    ): Promise<UserList> {
      const order = listOrder(
        q,
        {
          nombre: "Nombre",
          email: "Email",
          activo: "Activo",
          creadoEn: "CreadoEn",
        },
        "IDTabla",
      );
      const filters: string[] = [],
        params: (string | number)[] = [];
      if (q.q) {
        filters.push("(Nombre LIKE ? ESCAPE '!' OR Email LIKE ? ESCAPE '!')");
        params.push(
          ...Array<string>(2).fill("%" + q.q.replace(/[!%_]/g, "!$&") + "%"),
        );
      }
      if (q.estado !== "todos") {
        filters.push("Activo=?");
        params.push(q.estado === "activo" ? 1 : 0);
      }
      const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
      const c = await pool.getConnection();
      try {
        await c.query("START TRANSACTION READ ONLY");
        const [count] = await c.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM USUARIO" + where,
          params,
        );
        const [rows] = await c.execute<RowDataPacket[]>(
          "SELECT " +
            projection +
            " FROM USUARIO" +
            where +
            " ORDER BY " +
            order +
            " LIMIT ? OFFSET ?",
          [...params, q.limite, (q.pagina - 1) * q.limite],
        );
        await c.commit();
        return {
          registros: rows.map(record),
          total: Number(count[0]!.total),
          pagina: q.pagina,
          limite: q.limite,
        };
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
    async create(input: UserInput & { password: string }, actor: string) {
      const hash = await hashPassword(input.password);
      return mutation(actor, async (c) => {
        await c.query(
          "INSERT IGNORE INTO ROL (Codigo,Nombre,Activo) VALUES ('USUARIO','Usuario',1)",
        );
        const [roles] = await c.query<RowDataPacket[]>(
          "SELECT Activo FROM ROL WHERE Codigo='USUARIO' LOCK IN SHARE MODE",
        );
        if (!roles[0]?.Activo)
          throw new MasterRequestError(
            409,
            "La configuración interna de usuarios está inactiva.",
          );
        await c.execute(
          "INSERT INTO USUARIO (Nombre,Email,ClaveHash,Rol,Activo,Permisos,CreadoEn) VALUES (?,?,?,'USUARIO',?,?,?)",
          [
            input.nombre,
            input.email,
            hash,
            input.activo,
            JSON.stringify(input.permisos),
            new Date(),
          ],
        );
        const [ids] = await c.query<RowDataPacket[]>(
          "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
        );
        const after = await read(c, String(ids[0]!.id));
        await audit(c, actor, "ALTA", after.registro.id, after.registro);
        return after;
      });
    },
    async update(id: string, input: UserInput, version: string, actor: string) {
      return mutation(actor, async (c) => {
        const before = await read(c, id, true);
        if (before.version !== version)
          throw new MasterRequestError(
            409,
            "El usuario cambió. Volvé a consultarlo.",
          );
        if (id === actor && !input.activo)
          throw new MasterRequestError(
            400,
            "No podés desactivar tu propio usuario.",
          );
        // El carácter administrador no se recibe del cliente ni se modifica aquí.
        const permisos = before.registro.administrador ? [] : input.permisos;
        await c.execute(
          "UPDATE USUARIO SET Nombre=?,Email=?,Activo=?,Permisos=? WHERE IDTabla=?",
          [
            input.nombre,
            input.email,
            input.activo,
            JSON.stringify(permisos),
            id,
          ],
        );
        await revoke(c, id);
        const after = await read(c, id);
        await audit(c, actor, "MODIFICACION", id, {
          antes: before.registro,
          despues: after.registro,
        });
        return after;
      });
    },
    async resetPassword(
      id: string,
      password: string,
      version: string,
      actor: string,
    ) {
      const hash = await hashPassword(password);
      return mutation(actor, async (c) => {
        const before = await read(c, id, true);
        if (before.version !== version)
          throw new MasterRequestError(
            409,
            "El usuario cambió. Volvé a consultarlo.",
          );
        await c.execute("UPDATE USUARIO SET ClaveHash=? WHERE IDTabla=?", [
          hash,
          id,
        ]);
        await revoke(c, id);
        // Nunca guardar la clave, el hash ni el cuerpo de la solicitud en auditoría.
        await audit(c, actor, "RESTABLECER_CLAVE", id, {
          sesionesRevocadas: true,
        });
        return read(c, id);
      });
    },
  };
}
export type UserStore = ReturnType<typeof createUserStore>;
