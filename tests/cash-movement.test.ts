import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyUnits, moneyText } from "@erp/shared";
import { creation } from "../apps/api/src/cash-movement/validation.js";
test("Dinero de Caja conserva centavos e importes mayores a la precisión de Number", () => {
  assert.equal(
    moneyText(moneyUnits("9007199254740993.10") + moneyUnits("0.20")),
    "9007199254740993.30",
  );
  assert.equal(moneyText(0n), "0.00");
  assert.equal(moneyText(-1n), "-0.01");
  for (const v of ["1,50", "NaN", "-1", "1.001", "10000000000000000"])
    assert.throws(() => moneyUnits(v));
});
test("Caja valida identidad, fechas e instrumentos sin aceptar campos financieros arbitrarios", () => {
  const body = {
    Comprobante: "C",
    NumeroComprobante: "100000001",
    Cliente: "00001",
    FechaOrigen: "2026-10-27",
    CajaSaldo: "100000001",
    Concepto: null,
    ImporteEfectivo: "10",
    ImporteACuenta: "0",
    Observacion: null,
    Afectaciones: [{ CuentaCorriente: "100000002", Importe: "10" }],
    Valores: [],
  };
  assert.ok(creation.safeParse(body).success);
  assert.ok(
    !creation.safeParse({ ...body, FechaOrigen: "2026-02-31" }).success,
  );
  assert.ok(!creation.safeParse({ ...body, ImporteTotal: "10" }).success);
  assert.ok(
    !creation.safeParse({
      ...body,
      Afectaciones: [...body.Afectaciones, ...body.Afectaciones],
    }).success,
  );
  assert.ok(
    !creation.safeParse({
      ...body,
      Valores: [
        { Tipo: "CARTERA", Cheque: "100000003" },
        { Tipo: "CARTERA", Cheque: "100000003" },
      ],
    }).success,
  );
});
