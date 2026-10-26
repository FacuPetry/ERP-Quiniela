import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseDateInput,
  formatDateValue,
} from "../apps/web/src/components/controls/date-value.js";
import {
  amountFormat,
  parseAmountInput,
  formatAmount,
} from "../apps/web/src/components/controls/amount-value.js";

test("DatePicker interpreta los ejemplos y siempre conserva una fecha civil ISO", () => {
  for (const raw of ["31 12", "31-12", "31/12"])
    assert.equal(parseDateInput(raw, 2026), "2026-12-31");
  for (const raw of ["31 12 25", "31-12-25", "31/12/2025", " 31 / 12 / 25 "])
    assert.equal(parseDateInput(raw, 2026), "2025-12-31");
  assert.equal(parseDateInput("1/2", 2027), "2027-02-01");
  assert.equal(parseDateInput("1/2/00", 2026), "2000-02-01");
  assert.equal(formatDateValue("2026-12-31"), "31/12/2026");
  assert.equal(formatDateValue("2025-02-01"), "01/02/2025");
});
test("DatePicker rechaza fechas inexistentes, letras y desbordamientos sin corregirlos silenciosamente", () => {
  for (const raw of [
    "31/02/2026",
    "29/02/2025",
    "29/02/1900",
    "31/04/26",
    "0/1/26",
    "1/13/26",
    "1/0/26",
    "32/12/26",
    "abc",
    "31a12",
    "31.12.26",
    "2026-12-31",
    "31122026",
    "1/2/1",
    "1/2/0001",
    "1/2/12345",
    "",
    " / ",
  ])
    assert.equal(parseDateInput(raw, 2026), "", raw);
  assert.equal(parseDateInput("29/2/24", 2026), "2024-02-29");
  assert.equal(parseDateInput("29/2/2000", 2026), "2000-02-29");
  assert.equal(formatDateValue("2026-02-31"), "");
  assert.equal(formatDateValue(""), "");
});
test("AmountBox normaliza entrada regional y formatea sin perder precisión decimal", () => {
  const config = amountFormat();
  for (const [raw, canonical, display] of [
    ["1000", "1000.00", "1.000,00"],
    ["1250,5", "1250.50", "1.250,50"],
    ["1500000,75", "1500000.75", "1.500.000,75"],
    ["1.000,25", "1000.25", "1.000,25"],
    ["1000.5", "1000.50", "1.000,50"],
    ["1.000", "1000.00", "1.000,00"],
    ["0", "0.00", "0,00"],
    ["-1250,5", "-1250.50", "-1.250,50"],
    ["9999999999999999,99", "9999999999999999.99", "9.999.999.999.999.999,99"],
    ["00001250,50", "1250.50", "1.250,50"],
  ]) {
    assert.equal(parseAmountInput(raw!, config, 16).value, canonical, raw);
    assert.equal(formatAmount(canonical!, config), display);
  }
  assert.equal(
    formatAmount("1.000", config),
    "1,00",
    "los valores internos ya son decimales canónicos, no entrada localizada",
  );
  assert.deepEqual(parseAmountInput("", config), { value: "" });
  assert.equal(parseAmountInput("-0", config).value, "0.00");
});
test("AmountBox admite máscara, agrupación y región configurables sin redondeo silencioso", () => {
  const three = amountFormat("#,##0.000");
  assert.equal(parseAmountInput("1250,567", three).value, "1250.567");
  assert.equal(formatAmount("1250.567", three), "1.250,567");
  assert.equal(formatAmount("1250.50", amountFormat("0.00")), "1250,50");
  assert.equal(formatAmount("1250.00", amountFormat("#,##0")), "1.250");
  const us = amountFormat("#,##0.00", "en-US");
  assert.equal(parseAmountInput("1,250.50", us).value, "1250.50");
  assert.equal(formatAmount("1250.50", us), "1,250.50");
  assert.throws(() => amountFormat("$0.00"));
  assert.throws(() => amountFormat("0.################"));
});
test("AmountBox invalida importes incorrectos y exceso de precisión; el formulario conserva sus restricciones", () => {
  const config = amountFormat();
  for (const raw of [
    "abc",
    "$100",
    "1e3",
    "1.23.45",
    "1,2,3",
    "12,345",
    "0,001",
    "99999999999999999",
    "--1",
    "Infinity",
    "NaN",
  ])
    assert.ok(parseAmountInput(raw, config, 16).error, raw);
  assert.equal(parseAmountInput("12,3400", config).value, "12.34");
  assert.ok(parseAmountInput("12,5", amountFormat("0")).error);
  assert.equal(
    parseAmountInput("-1", config).value,
    "-1.00",
    "la condición positiva pertenece al módulo, no al formato",
  );
});
