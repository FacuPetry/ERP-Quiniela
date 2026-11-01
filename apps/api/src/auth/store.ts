import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  legacyReadPermissions,
  menuOptions,
  type CurrentUser,
  type MenuPermission,
} from "@erp/shared";

export interface Account {
  usuario: CurrentUser;
  claveHash: string;
  activo: boolean;
  rolActivo: boolean;
}
export interface StoredSession {
  usuario: CurrentUser;
  venceEn: Date;
}
export interface AuthStore {
  findAccount(email: string): Promise<Account | null>;
  createSession(
    userId: string,
    hash: string,
    created: Date,
    expires: Date,
    credentialHash?: string,
  ): Promise<void | boolean>;
  findSession(hash: string, now: Date): Promise<StoredSession | null>;
  revokeSession(hash: string, now: Date): Promise<void>;
}

export function storedPermissions(
  value: unknown,
  role: string,
): MenuPermission[] {
  if (value == null) return role === "USUARIO" ? [] : legacyReadPermissions;
  try {
    const parsed: unknown =
      typeof value === "string" ? JSON.parse(value) : value;
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (p) =>
          !p ||
          !menuOptions.some((m) => m.key === p.menu) ||
          typeof p.escritura !== "boolean",
      )
    )
      return [];
    return parsed as MenuPermission[];
  } catch {
    return [];
  }
}
function currentUser(row: RowDataPacket): CurrentUser {
  return {
    id: String(row.IDTabla),
    nombre: row.Nombre,
    email: row.Email,
    permisos: storedPermissions(row.Permisos, String(row.Rol)),
    rol: { codigo: row.Rol, nombre: row.RolNombre },
  };
}

export function createAuthStore(pool: Pool): AuthStore {
  return {
    async findAccount(email) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.IDTabla, u.Nombre, u.Email, u.ClaveHash, u.Activo, u.Rol, u.Permisos,
          r.Nombre AS RolNombre, r.Activo AS RolActivo
         FROM USUARIO u JOIN ROL r ON r.Codigo = u.Rol WHERE u.Email = ? LIMIT 1`,
        [email],
      );
      const row = rows[0];
      return row
        ? {
            usuario: currentUser(row),
            claveHash: row.ClaveHash,
            activo: Boolean(row.Activo),
            rolActivo: Boolean(row.RolActivo),
          }
        : null;
    },
    async createSession(userId, hash, created, expires, credentialHash) {
      // Serializa con cambio de clave/desactivación: una autenticación iniciada
      // con la clave anterior no puede dejar una sesión vigente tras su revocación.
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const [rows] = await c.execute<RowDataPacket[]>(
          "SELECT u.ClaveHash FROM USUARIO u JOIN ROL r ON r.Codigo=u.Rol WHERE u.IDTabla=? AND u.Activo=1 AND r.Activo=1 FOR UPDATE",
          [userId],
        );
        if (
          !rows[0] ||
          (credentialHash !== undefined && rows[0].ClaveHash !== credentialHash)
        ) {
          await c.rollback();
          return false;
        }
        await c.execute(
          "INSERT INTO SESION (Usuario, TokenHash, CreadoEn, VenceEn) VALUES (?, ?, ?, ?)",
          [userId, hash, created, expires],
        );
        await c.commit();
        return true;
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    },
    async findSession(hash, now) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.IDTabla, u.Nombre, u.Email, u.Rol, u.Permisos, r.Nombre AS RolNombre, s.VenceEn
         FROM SESION s JOIN USUARIO u ON u.IDTabla = s.Usuario JOIN ROL r ON r.Codigo = u.Rol
         WHERE s.TokenHash = ? AND s.RevocadoEn IS NULL AND s.VenceEn > ?
           AND u.Activo = 1 AND r.Activo = 1 LIMIT 1`,
        [hash, now],
      );
      return rows[0]
        ? { usuario: currentUser(rows[0]), venceEn: rows[0].VenceEn }
        : null;
    },
    async revokeSession(hash, now) {
      await pool.execute(
        "UPDATE SESION SET RevocadoEn = ? WHERE TokenHash = ? AND RevocadoEn IS NULL",
        [now, hash],
      );
    },
  };
}
