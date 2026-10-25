import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceOptions } from "../apps/web/src/services/masters.js";

test("Los combos cargan todas las páginas, fuerzan activos y conservan filtros de contexto", async (t) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (path: string) => {
    const url = new URL(path, "https://erp.example.invalid");
    requests.push(url);
    const page = Number(url.searchParams.get("pagina"));
    const registros =
      page === 1
        ? Array.from({ length: 100 }, (_, i) => ({
            Codigo: String(i).padStart(3, "0"),
            Nombre: "Opción",
            Activo: true,
          }))
        : [
            { Codigo: "100", Nombre: "Última opción", Activo: true },
            { Codigo: "INACTIVO", Nombre: "No ofrecer", Activo: false },
          ];
    return new Response(
      JSON.stringify({ registros, total: 102, pagina: page, limite: 100 }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const result = await referenceOptions("tipos-cliente", {
    estado: "todos",
    pagina: "99",
    limite: "1",
    q: "contexto",
  });
  assert.equal(requests.length, 2);
  assert.equal(result.length, 101);
  assert.equal(result.at(-1)?.Codigo, "100");
  assert.equal(
    result.some((row) => row.Codigo === "INACTIVO"),
    false,
  );
  for (const url of requests) {
    assert.equal(url.searchParams.get("estado"), "activo");
    assert.equal(url.searchParams.get("limite"), "100");
    assert.equal(url.searchParams.get("q"), "contexto");
  }
  assert.deepEqual(
    requests.map((url) => url.searchParams.get("pagina")),
    ["1", "2"],
  );
});
