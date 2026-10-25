import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readConfig } from "../config/env.js";
import { createDatabase } from "../database/client.js";
import { createInitialAdmin, InitialAdminError } from "./bootstrap.js";

function secret(question: string): Promise<string> {
  stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === "\u0003" || character === "\u0004") {
          finish();
          reject(new InitialAdminError("Operación cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b")
          value = Array.from(value).slice(0, -1).join("");
        else if (character >= " " && value.length < 129) value += character;
      }
    }
    stdin.on("data", onData);
  });
}

try {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new InitialAdminError(
      "Abrí una terminal interactiva (SSH con TTY) para ingresar la contraseña de forma oculta.",
    );
  const prompts = createInterface({ input: stdin, output: stdout });
  let nombre: string;
  let email: string;
  try {
    nombre = await prompts.question("Nombre del administrador: ");
    email = await prompts.question("Correo de acceso: ");
  } finally {
    prompts.close();
  }
  const password = await secret(
    "Contraseña nueva (mínimo 12 caracteres; no se muestra): ",
  );
  const confirmation = await secret("Repetir contraseña: ");
  if (password !== confirmation)
    throw new InitialAdminError("Las contraseñas no coinciden.");
  const { pool } = createDatabase(readConfig());
  try {
    const id = await createInitialAdmin(pool, { nombre, email, password });
    console.log(
      `Administrador inicial creado. Identificador: ${id}. Ya podés ingresar con tu correo.`,
    );
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(
    error instanceof InitialAdminError
      ? error.message
      : "No se pudo crear el administrador. Comprobá las variables de conexión y aplicá primero las migraciones.",
  );
  process.exitCode = 1;
}
