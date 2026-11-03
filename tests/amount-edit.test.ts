import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountFormat,
  formatAmount,
} from "../apps/web/src/components/controls/amount-value.js";
import {
  draftAmountEdit,
  finishAmountEdit,
} from "../apps/web/src/components/controls/amount-edit.js";

test("El borrador conserva el texto escrito o pegado; solo Blur aplica miles y decimales", () => {
  const config = amountFormat();
  for (const [text, value, formatted] of [
    ["10000", "10000.00", "10.000,00"],
    ["1250,5", "1250.50", "1.250,50"],
    ["1.000,25", "1000.25", "1.000,25"],
    ["1000.5", "1000.50", "1.000,50"],
    ["-25,75", "-25.75", "-25,75"],
  ] as const) {
    assert.deepEqual(draftAmountEdit(text, config), { text, value });
    assert.deepEqual(finishAmountEdit(text, config), {
      text: formatted,
      value,
    });
  }
});

test("Un texto inválido permanece visible mientras se edita y vuelve a cero al salir", () => {
  for (const config of [
    amountFormat(),
    amountFormat("0"),
    amountFormat("#,##0.000"),
    amountFormat("#,##0.00", "en-US"),
  ]) {
    const zero = formatAmount("0", config);
    for (const text of [
      "abc",
      "1e3",
      "$100",
      `10${config.decimal}${config.decimal}50`,
      "99999999999999999",
    ]) {
      const draft = draftAmountEdit(text, config, 16);
      assert.equal(draft.text, text);
      assert.match(draft.value, /^0(?:\.0+)?$/);
      assert.deepEqual(finishAmountEdit(text, config, 16), {
        text: zero,
        value: draft.value,
      });
    }
  }
});

test("Vacío y estados intermedios no se reescriben hasta Blur ni conservan un valor anterior", () => {
  const config = amountFormat();
  for (const text of ["", "-", ",", "10,,50"]) {
    assert.deepEqual(draftAmountEdit(text, config), { text, value: "0.00" });
    assert.deepEqual(finishAmountEdit(text, config), {
      text: "0,00",
      value: "0.00",
    });
  }
  assert.equal(draftAmountEdit("12,", config).text, "12,");
  assert.equal(finishAmountEdit("12,", config).text, "12,00");
});

test("Blur conserva la validación estricta de separadores y precisión sin redondear", () => {
  const config = amountFormat();
  for (const text of ["1.23.45", "1.0000,00", "1..000", "12,345"]) {
    assert.equal(draftAmountEdit(text, config).text, text);
    assert.equal(finishAmountEdit(text, config).value, "0.00");
  }
  assert.equal(draftAmountEdit("12,340", config).text, "12,340");
  assert.equal(finishAmountEdit("12,340", config).text, "12,34");
});

test("Máscaras, regiones y cifras grandes mantienen el decimal canónico exacto", () => {
  for (const [text, config, formatted, value] of [
    ["1000", amountFormat("#,##0"), "1.000", "1000"],
    ["1250,567", amountFormat("#,##0.000"), "1.250,567", "1250.567"],
    ["1,005", amountFormat("0.000"), "1,005", "1.005"],
    ["1250.5", amountFormat("#,##0.00", "en-US"), "1,250.50", "1250.50"],
    [
      "9999999999999999,99",
      amountFormat(),
      "9.999.999.999.999.999,99",
      "9999999999999999.99",
    ],
  ] as const) {
    assert.deepEqual(draftAmountEdit(text, config, 16), { text, value });
    assert.deepEqual(finishAmountEdit(text, config, 16), {
      text: formatted,
      value,
    });
  }
});
