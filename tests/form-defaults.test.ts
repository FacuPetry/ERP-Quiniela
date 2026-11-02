import assert from "node:assert/strict";
import { test } from "node:test";
import { todayISO } from "../apps/web/src/components/controls/date-value.js";
import {
  initialDateRange,
  initialListFilters,
} from "../apps/web/src/components/ui/filter-defaults.js";
import { initialMasterFieldValue } from "../apps/web/src/components/controls/numeric-defaults.js";
import {
  amountFormat,
  formatAmount,
} from "../apps/web/src/components/controls/amount-value.js";

test("Los filtros sugieren los últimos 30 días civiles y Confirmado sin sobrescribir filtros aplicados ni Limpiar", () => {
  const empty = { Desde: "", Hasta: "", Estado: "TODOS", q: "" };
  assert.equal(todayISO(new Date("2026-10-27T01:30:00Z")), "2026-10-26");
  assert.deepEqual(
    initialListFilters(empty, ["Desde", "Hasta"], "Estado", "2026-10-26"),
    {
      Desde: "2026-09-26",
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
test("El rango común cruza meses, años y febrero bisiesto; fecha aislada conserva hoy", () => {
  assert.deepEqual(initialDateRange("2026-11-02"), {
    from: "2026-10-03",
    to: "2026-11-02",
  });
  assert.deepEqual(initialDateRange("2026-01-15"), {
    from: "2025-12-16",
    to: "2026-01-15",
  });
  assert.deepEqual(initialDateRange("2024-03-01"), {
    from: "2024-01-31",
    to: "2024-03-01",
  });
  assert.deepEqual(initialDateRange("2026-03-01"), {
    from: "2026-01-30",
    to: "2026-03-01",
  });
  assert.deepEqual(
    initialListFilters({ Fecha: "" }, ["Fecha"], undefined, "2026-11-02"),
    { Fecha: "2026-11-02" },
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
