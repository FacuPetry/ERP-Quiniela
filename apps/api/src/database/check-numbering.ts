import mysql from "mysql2/promise";
import { readConfig, databaseOptions } from "../config/env.js";
import { inspectNumberingMigration } from "./numbering-preflight.js";
let connection;
try {
  connection = await mysql.createConnection(databaseOptions(readConfig()));
  const issues = await inspectNumberingMigration(connection);
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else
    console.log(
      "Numeración compatible. Comprobación de solo lectura; no se modificaron registros.",
    );
} catch {
  console.error(
    "No se pudo comprobar la numeración. Revisar la conexión y permisos.",
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
