import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  // Acotar los parámetros evita que un hash corrupto demande recursos arbitrarios.
  const match = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    stored,
  );
  if (!match) return false;
  const actual = await derive(password, match[1]!);
  return timingSafeEqual(actual, Buffer.from(match[2]!, "hex"));
}

// Conserva el costo de scrypt cuando el correo no existe, sin una clave de acceso válida.
export const dummyPasswordHash = `scrypt$32768$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfToken = (token: string) =>
  createHash("sha256").update(`erp-csrf:${token}`).digest("hex");

export function equalToken(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
