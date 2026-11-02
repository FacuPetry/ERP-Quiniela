import assert from "node:assert/strict";
import { test } from "node:test";
import { groupReportRows } from "../apps/web/src/components/reports/group-rows.js";

test("El corte se determina sobre el grupo completo, no sobre el prefijo visible", () => {
  const rows = Array.from({ length: 205 }, (_, n) => ({
    key: String(n),
    box: n < 201 ? "A" : "B",
  }));
  const grouped = groupReportRows(
    rows,
    (r) => r.key,
    (r) => r.box,
  );
  assert.equal(
    grouped.lastRows.has(grouped.rows.slice(0, 200).at(-1)!.key),
    false,
  );
  assert.equal(grouped.lastRows.get(grouped.rows[200]!.key), "A");
  assert.equal(grouped.lastRows.get(grouped.rows.at(-1)!.key), "B");
  assert.equal(grouped.lastRows.size, 2);
});
test("La base reúne grupos intercalados y conserva orden interno e identidades", () => {
  const grouped = groupReportRows(
    [
      { id: "1", box: "A", name: "Igual" },
      { id: "2", box: "B", name: "Igual" },
      { id: "3", box: "A", name: "Igual" },
    ],
    (r) => r.id,
    (r) => r.box,
  );
  assert.deepEqual(
    grouped.rows.map((r) => r.id),
    ["1", "3", "2"],
  );
  assert.deepEqual(
    [...grouped.lastRows],
    [
      ["3", "A"],
      ["2", "B"],
    ],
  );
  assert.deepEqual(
    groupReportRows(
      [] as { id: string; box: string }[],
      (r) => r.id,
      (r) => r.box,
    ),
    { rows: [], lastRows: new Map() },
  );
});
