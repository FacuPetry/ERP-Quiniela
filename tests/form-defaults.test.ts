import assert from "node:assert/strict";
import { test } from "node:test";
import { todayISO } from "../apps/web/src/components/controls/date-value.js";
import { initialListFilters } from "../apps/web/src/components/ui/filter-defaults.js";
import { initialMasterFieldValue } from "../apps/web/src/components/controls/numeric-defaults.js";
import {
  amountFormat,
  formatAmount,
} from "../apps/web/src/components/controls/amount-value.js";

test("Los filtros sugieren fecha civil de Argentina y Confirmado sin modificar los valores para Limpiar", () => {
  const empty = { Desde: "", Hasta: "", Estado: "TODOS", q: "" };
  assert.equal(todayISO(new Date("2026-10-27T01:30:00Z")), "2026-10-26");
  assert.deepEqual(
    initialListFilters(empty, ["Desde", "Hasta"], "Estado", "2026-10-26"),
    {
      Desde: "2026-10-26",
      Hasta: "2026-10-26",
      Estado: "CONFIRMADO",
      q: "",
    },
  );
  assert.deepEqual(empty, { Desde: "", Hasta: "", Estado: "TODOS", q: "" });
  assert.deepEqual(
    initialListFilters({ estado: "todos" }, [], undefined, "2026-10-26"),
    { estado: "todos" },
  );
  const applied = { Desde: "", Hasta: "", Estado: "ANULADO" };
  assert.deepEqual(
    {
      ...initialListFilters(empty, ["Desde", "Hasta"], "Estado", "2026-10-26"),
      ...applied,
    },
    { ...empty, ...applied },
  );
});
test("El cero numérico de alta respeta overrides, códigos y PK generadas", () => {
  const integer = {
    name: "Orden",
    label: "Orden",
    maxLength: 10,
    kind: "integer" as const,
  };
  assert.equal(initialMasterFieldValue(integer, "Codigo"), "0");
  assert.equal(
    initialMasterFieldValue({ ...integer, defaultValue: "12" }, "Codigo"),
    "12",
  );
  assert.equal(
    initialMasterFieldValue({ ...integer, defaultValue: "" }, "Codigo"),
    "",
  );
  assert.equal(
    initialMasterFieldValue({ ...integer, name: "IDTabla" }, "IDTabla"),
    "",
  );
  assert.equal(
    initialMasterFieldValue(
      { name: "Codigo", label: "Código", maxLength: 20 },
      "Codigo",
    ),
    "",
  );
  assert.equal(formatAmount("0", amountFormat()), "0,00");
  assert.equal(formatAmount("0", amountFormat("#,##0.000")), "0,000");
  assert.equal(formatAmount("0", amountFormat("0")), "0");
});
