import assert from "node:assert/strict";
import { test } from "node:test";
import {
  balanceMessage,
  messageBalanceDate,
} from "../apps/api/src/messages/text.js";

test("Mensaje de saldo distingue deuda, saldo a favor y cero sin invertir signos", () => {
  const positive = balanceMessage("Ana", "150000.00", "2026-11-03");
  assert.equal(positive.Situacion, "PENDIENTE_PAGO");
  assert.equal(
    positive.Mensaje,
    "Hola, Ana. Desde la agencia de quiniela te informamos que tu saldo pendiente de pago al 03/11/2026 es de $150.000,00. Muchas gracias.",
  );
  const negative = balanceMessage("Ana", "-150000.25", "2026-11-03");
  assert.equal(negative.Situacion, "A_FAVOR");
  assert.match(negative.Mensaje, /saldo a tu favor de \$150\.000,25/);
  assert.ok(!negative.Mensaje.includes("pendiente de pago"));
  for (const value of ["0.00", "-0.00"]) {
    const empty = balanceMessage("Ana", value, "2026-11-03");
    assert.equal(empty.Situacion, "SIN_SALDO");
    assert.match(empty.Mensaje, /saldo neto.*\$0,00/);
    assert.ok(!empty.Mensaje.includes("pendiente de pago"));
  }
});
test("Mensaje de saldo conserva centavos y sumas superiores a la precisión de Number", () => {
  assert.match(
    balanceMessage("  ANA\n PÉREZ ", "999999999999999999.99", "2026-11-03")
      .Mensaje,
    /Hola, ANA PÉREZ\..*\$999\.999\.999\.999\.999\.999,99/,
  );
  assert.match(
    balanceMessage("Ana", "-0.01", "2026-11-03").Mensaje,
    /saldo a tu favor de \$0,01/,
  );
  for (const invalid of ["NaN", "", "1.234,50", "1e3", "12.345"])
    assert.throws(() => balanceMessage("Ana", invalid, "2026-11-03"));
});
test("Fecha del mensaje usa el día de Argentina también en el límite de medianoche UTC", () => {
  assert.equal(
    messageBalanceDate(new Date("2026-11-03T02:59:59Z")),
    "2026-11-02",
  );
  assert.equal(
    messageBalanceDate(new Date("2026-11-03T03:00:00Z")),
    "2026-11-03",
  );
});
