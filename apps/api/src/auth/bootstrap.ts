import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { hashPassword } from "./crypto.js";

export class InitialAdminError extends Error {}

const inputSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().pipe(z.email().max(150)),
    password: z.string().min(12).max(128),
  })
  .strict();

/** Comando administrativo; nunca se expone como endpoint ni se ejecuta al iniciar. */
export async function createInitialAdmin(
  pool: Pool,
  input: { nombre: string; email: string; password: string },
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new InitialAdminError(
      "Ingresá nombre (hasta 100 caracteres), correo válido y contraseña de entre 12 y 128 caracteres.",
    );
  const data = parsed.data;
  const hash = await hashPassword(data.password);
  const connection = await pool.getConnection();
  let locked = false;
  let transaction = false;
  try {
    const [lock] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('erp_quiniela_initial_admin', 15) AS acquired",
    );
    locked = Number(lock[0]?.acquired) === 1;
    if (!locked)
      throw new InitialAdminError(
        "Hay otra preparación de administrador en curso.",
      );
    await connection.beginTransaction();
    transaction = true;
    const [users] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM USUARIO",
    );
    if (Number(users[0]?.total) !== 0)
      throw new InitialAdminError(
        "Ya existen usuarios. Este comando solo permite crear el primer administrador y no cambia contraseñas existentes.",
      );
    const [roles] = await connection.execute<RowDataPacket[]>(
      "SELECT Activo FROM ROL WHERE Codigo = ?",
      ["ADMIN"],
    );
    if (roles[0] && !Boolean(roles[0].Activo))
      throw new InitialAdminError(
        "El rol ADMIN está inactivo. Revisá su configuración antes de continuar.",
      );
    if (!roles[0])
      await connection.execute(
        "INSERT INTO ROL (Codigo, Nombre, Activo) VALUES (?, ?, 1)",
        ["ADMIN", "Administrador"],
      );
    const now = new Date();
    await connection.execute(
      "INSERT INTO USUARIO (Nombre, Email, ClaveHash, Rol, Activo, CreadoEn) VALUES (?, ?, ?, ?, 1, ?)",
      [data.nombre, data.email, hash, "ADMIN", now],
    );
    const [inserted] = await connection.query<RowDataPacket[]>(
      "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id",
    );
    const id = String(inserted[0]!.id);
    await connection.execute(
      "INSERT INTO AUDITORIA (Usuario, Accion, Tabla, Registro, Fecha) VALUES (?, ?, ?, ?, ?)",
      [id, "ALTA_ADMIN_INICIAL", "USUARIO", id, now],
    );
    await connection.commit();
    transaction = false;
    return id;
  } finally {
    try {
      if (transaction) await connection.rollback();
    } finally {
      try {
        if (locked)
          await connection.query(
            "SELECT RELEASE_LOCK('erp_quiniela_initial_admin')",
          );
      } finally {
        connection.release();
      }
    }
  }
}
