import assert from "node:assert/strict";
import { test } from "node:test";
import { cashCorrection, cashStateLabel, type CashRecord } from "@erp/shared";

test("Caja: etiquetas distinguen estado y reversión sin un campo Origen", () => {
  assert.equal(
    cashStateLabel({ Estado: "CONFIRMADO", CajaMovimientoOrigen: null }),
    "Confirmado",
  );
  assert.equal(
    cashStateLabel({ Estado: "CONFIRMADO", CajaMovimientoOrigen: "100000001" }),
    "Confirmado · Reversión",
  );
  assert.equal(
    cashStateLabel({ Estado: "REVERTIDO", CajaMovimientoOrigen: null }),
    "Revertido",
  );
  assert.equal(
    cashStateLabel({ Estado: "ANULADO", CajaMovimientoOrigen: null }),
    "Anulado",
  );
});
test("Caja: la corrección depende de la apertura real, no de la caja física ni del día", () => {
  const record = {
    Estado: "CONFIRMADO",
    CajaMovimientoOrigen: null,
    RevertidoPor: null,
    CajaSaldo: "100000001",
    JornadaEstado: "ABIERTO",
  } satisfies Pick<
    CashRecord,
    | "Estado"
    | "CajaMovimientoOrigen"
    | "RevertidoPor"
    | "CajaSaldo"
    | "JornadaEstado"
  >;
  assert.equal(cashCorrection(record, "100000001"), "anular");
  assert.equal(cashCorrection(record, "100000002"), null);
  assert.equal(cashCorrection(record, null), null);
  assert.equal(
    cashCorrection({ ...record, JornadaEstado: "CERRADO" }, "100000001"),
    null,
  );
  assert.equal(
    cashCorrection({ ...record, JornadaEstado: "CERRADO" }, "100000002"),
    "revertir",
  );
  assert.equal(
    cashCorrection({ ...record, JornadaEstado: null }, "100000001"),
    null,
  );
  for (const change of [
    { Estado: "ANULADO" },
    { Estado: "REVERTIDO" },
    { CajaMovimientoOrigen: "100000000" },
    { RevertidoPor: "100000002" },
  ])
    assert.equal(cashCorrection({ ...record, ...change }, "100000001"), null);
});
