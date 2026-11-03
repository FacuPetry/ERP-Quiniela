import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountFormat,
  formatAmount,
} from "../apps/web/src/components/controls/amount-value.js";
import {
  editAmountInput,
  finishAmountEdit,
  pasteAmountInput,
} from "../apps/web/src/components/controls/amount-edit.js";

test("Edición agrupada agrega, inserta y borra dígitos sin convertir miles a decimales", () => {
  const c = amountFormat();
  assert.deepEqual(editAmountInput("1.000,00", "1.0000,00", 6, c), {
    text: "10.000,00",
    value: "10000.00",
    caret: 6,
  });
  assert.deepEqual(editAmountInput("1.234,56", "1.2934,56", 4, c), {
    text: "12.934,56",
    value: "12934.56",
    caret: 4,
  });
  assert.deepEqual(editAmountInput("1.234,56", "1.34,56", 2, c), {
    text: "134,56",
    value: "134.56",
    caret: 1,
  });
  const integer = editAmountInput("1.000", "1.0000", 6, amountFormat("#,##0"));
  assert.equal(integer.value, "10000");
  assert.equal(integer.text, "10.000");
  assert.equal(integer.caret, 6);
});
test("Pegado parcial conserva ceros y no interpreta separadores inválidos como dígitos", () => {
  const c = amountFormat();
  assert.equal(pasteAmountInput("1.000,00", "1.23.45", 0, 5, c).value, "0.00");
  assert.equal(pasteAmountInput("1.000,00", "1000.5", 0, 5, c).value, "0.00");
  const integer = pasteAmountInput("1.000,00", "1.500", 0, 5, c);
  assert.equal(integer.text, "1.500,00");
  assert.equal(integer.value, "1500.00");
  const decimals = pasteAmountInput(
    "1,000",
    "005",
    2,
    5,
    amountFormat("0.000"),
  );
  assert.equal(decimals.text, "1,005");
  assert.equal(decimals.value, "1.005");
});
test("Letras, separadores decimales dobles y exceso de precisión/límite vuelven a cero formateado", () => {
  for (const c of [
    amountFormat(),
    amountFormat("0"),
    amountFormat("#,##0.000"),
    amountFormat("#,##0.00", "en-US"),
  ]) {
    for (const raw of [
      "abc",
      "1e3",
      "NaN",
      "$100",
      `10${c.decimal}${c.decimal}50`,
      "99999999999999999",
    ]) {
      const result = editAmountInput("0", raw, raw.length, c, 16);
      assert.equal(result.text, formatAmount("0", c), raw);
      assert.match(result.value, /^0(?:\.0+)?$/);
    }
  }
  assert.equal(editAmountInput("0", "12,345", 6, amountFormat()).value, "0.00");
  assert.equal(finishAmountEdit("1..000", amountFormat()).text, "0,00");
});
test("Vacío y estados intermedios mantienen modelo numérico; confirmar repone cero o decimales", () => {
  const c = amountFormat();
  assert.deepEqual(editAmountInput("1.000,00", "", 0, c), {
    text: "",
    value: "0.00",
    caret: 0,
  });
  assert.equal(finishAmountEdit("", c).text, "0,00");
  assert.equal(finishAmountEdit("-", c).value, "0.00");
  assert.equal(editAmountInput("0", "-", 1, c).text, "-");
  assert.equal(editAmountInput("-", "-12", 3, c).value, "-12.00");
  assert.equal(editAmountInput("0", ",", 1, c).text, "0,");
  assert.equal(editAmountInput("12", "12,5", 4, c).text, "12,5");
  assert.equal(finishAmountEdit("12,5", c).text, "12,50");
  assert.equal(editAmountInput("12,34", "12,340", 6, c).text, "12,34");
});
test("Máscaras, regiones, pegado y cifras grandes conservan decimales exactos", () => {
  assert.equal(finishAmountEdit("1000.5", amountFormat()).text, "1.000,50");
  assert.equal(
    editAmountInput("1000", "1000.", 5, amountFormat()).text,
    "1.000,",
  );
  assert.equal(finishAmountEdit("1.000", amountFormat()).value, "1000.00");
  assert.equal(
    finishAmountEdit("1250,567", amountFormat("#,##0.000")).text,
    "1.250,567",
  );
  assert.deepEqual(
    editAmountInput(
      "1,234.50",
      "1,2934.50",
      4,
      amountFormat("#,##0.00", "en-US"),
    ),
    { text: "12,934.50", value: "12934.50", caret: 4 },
  );
  const big = finishAmountEdit("9.999.999.999.999.999,99", amountFormat(), 16);
  assert.equal(big.value, "9999999999999999.99");
  assert.equal(big.text, "9.999.999.999.999.999,99");
});
