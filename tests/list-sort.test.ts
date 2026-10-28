import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareSortValues,
  listSortQuery,
  nextListSort,
  sortListRows,
} from "@erp/shared";
import { listOrder } from "../apps/api/src/database/list-order.js";
import { MasterRequestError } from "../apps/api/src/masters/validation.js";

test("Orden: descendente, ascendente, predeterminado y cambio de columna", () => {
  const first = nextListSort(null, "Importe");
  assert.deepEqual(first, { campo: "Importe", direccion: "desc" });
  const second = nextListSort(first, "Importe");
  assert.deepEqual(second, { campo: "Importe", direccion: "asc" });
  assert.equal(nextListSort(second, "Importe"), null);
  assert.deepEqual(nextListSort(second, "Fecha"), {
    campo: "Fecha",
    direccion: "desc",
  });
  assert.deepEqual(listSortQuery(null), {});
  assert.deepEqual(listSortQuery(first), {
    orden: "Importe",
    direccion: "desc",
  });
});
test("Orden local: decimales exactos, fechas civiles, textos, empates y colección sin mutar", () => {
  assert.ok(compareSortValues("10.00", "2.00", "number") > 0);
  assert.ok(
    compareSortValues("9007199254740993.01", "9007199254740993.02", "number") <
      0,
  );
  assert.equal(compareSortValues("01.0", "1.000", "number"), 0);
  assert.ok(compareSortValues("-10.5", "-2.01", "number") < 0);
  assert.equal(compareSortValues("-0.00", "0", "number"), 0);
  assert.ok(compareSortValues("2026-02-01", "2026-01-31", "date") > 0);
  assert.ok(compareSortValues("Alfa", "Zeta") < 0);
  assert.ok(compareSortValues(null, "A") < 0);
  assert.ok(compareSortValues("Sin número", "1", "number") < 0);
  assert.equal(compareSortValues("", null, "number"), 0);
  const rows = Object.freeze([
    { id: "a", n: "2.00" },
    { id: "b", n: "10.00" },
    { id: "c", n: "2.00" },
  ]);
  const col = {
    value: (r: (typeof rows)[number]) => r.n,
    type: "number" as const,
  };
  assert.deepEqual(
    sortListRows(rows, { campo: "n", direccion: "desc" }, col).map((r) => r.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    sortListRows(rows, { campo: "n", direccion: "asc" }, col).map((r) => r.id),
    ["a", "c", "b"],
  );
  assert.equal(sortListRows(rows, null, col), rows);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("Orden SQL: solo campos autorizados, dirección validada y desempate estable", () => {
  assert.equal(
    listOrder({}, { Importe: "a.Importe" }, "a.IDTabla"),
    "a.IDTabla ASC",
  );
  assert.equal(
    listOrder(
      { orden: "Importe", direccion: "desc" },
      { Importe: "a.Importe" },
      "a.IDTabla",
    ),
    "a.Importe DESC, a.IDTabla ASC",
  );
  for (const query of [
    { orden: "Importe" },
    { direccion: "asc" as const },
    { orden: "__proto__", direccion: "asc" as const },
    { orden: "Importe DESC; DROP TABLE CLIENTE", direccion: "asc" as const },
  ])
    assert.throws(
      () => listOrder(query, { Importe: "a.Importe" }, "a.IDTabla"),
      MasterRequestError,
    );
});
