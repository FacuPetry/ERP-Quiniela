import assert from "node:assert/strict";
import { test } from "node:test";
import {
  balanceMessage,
  messageBalanceDate,
} from "../apps/api/src/messages/text.js";
import { whatsappPhone } from "../apps/api/src/messages/phone.js";
import {
  defaultMessageTemplate,
  messageTemplateProblem,
  renderMessageTemplate,
  whatsappMessageUrl,
} from "@erp/shared";

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
test("NombreFantasia usa el dato del cliente o su nombre si falta, sin reemplazos recursivos", () => {
  const template = "Hola {NombreFantasia}, saldo: {MontoTotal}.";
  const custom = balanceMessage(
    "Ana Pérez",
    "150000.25",
    "2026-11-03",
    template,
    "  Local\n Sur {MontoTotal}  ",
  );
  assert.equal(custom.Variables.NombreCliente, "Ana Pérez");
  assert.equal(custom.Variables.NombreFantasia, "Local Sur {MontoTotal}");
  assert.equal(
    custom.Mensaje,
    "Hola Local Sur {MontoTotal}, saldo: $150.000,25.",
  );
  for (const empty of [null, "", "  \n "]) {
    const result = balanceMessage(
      " Ana  Pérez ",
      "-25.00",
      "2026-11-03",
      template,
      empty,
    );
    assert.equal(result.Variables.NombreFantasia, "Ana Pérez");
    assert.equal(result.Mensaje, "Hola Ana Pérez, saldo: -$25,00.");
  }
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
test("Plantillas reemplazan todas las variables literalmente, sin recursión ni cálculo financiero", () => {
  const value = balanceMessage("Ana {MontoTotal}", "-150000.25", "2026-11-03");
  assert.equal(
    renderMessageTemplate(
      "{NombreCliente}: {MontoTotal} / {MontoTotal} al {FechaSaldo}",
      value.Variables,
    ),
    "Ana {MontoTotal}: -$150.000,25 / -$150.000,25 al 03/11/2026",
  );
  assert.equal(
    renderMessageTemplate(defaultMessageTemplate, value.Variables),
    value.Mensaje,
  );
  assert.equal(
    renderMessageTemplate("Texto sin variables", value.Variables),
    "Texto sin variables",
  );
  for (const text of [
    "",
    "   ",
    "{NoExiste}",
    "{NombreCliente",
    "NombreCliente}",
    "{{NombreCliente}}",
    "a".repeat(2001),
  ]) {
    assert.ok(messageTemplateProblem(text), text);
    assert.throws(() => renderMessageTemplate(text, value.Variables));
  }
  assert.throws(() =>
    renderMessageTemplate("{NombreCliente}".repeat(120), {
      ...value.Variables,
      NombreCliente: "a".repeat(100),
    }),
  );
});
test("Teléfonos de WhatsApp se validan sin inventar área ni tomar extensiones o múltiples contactos", () => {
  for (const raw of [
    "+54 9 11 1234-5678",
    "005491112345678",
    "5491112345678",
    "54 9 11 1234-5678",
    "011 15-1234-5678",
    "(11) 1234-5678",
    "11 1234-5678",
    "(011) 1234-5678",
    "+54 11 1234-5678",
    "0054 11 1234-5678",
    "54 (011) 15-1234-5678",
    "9 11 1234-5678",
  ])
    assert.equal(whatsappPhone(raw).WhatsAppNumero, "5491112345678", raw);
  for (const raw of [
    "(341) 234-5678",
    "0341 15 2345678",
    "+54 341 2345678",
    "+54 9 341 2345678",
  ])
    assert.equal(whatsappPhone(raw).WhatsAppNumero, "5493412345678", raw);
  assert.equal(
    whatsappPhone("0376 15 4123456").WhatsAppNumero,
    "5493764123456",
  );
  assert.equal(whatsappPhone("+1 202 555 0123").WhatsAppNumero, "12025550123");
  for (const raw of [
    null,
    "",
    "   ",
    "123",
    "11 1234567",
    "+54 11 1234567",
    "15-1234-5678",
    "abc",
    "+54 9 11 1234-5678 int 2",
    "+54 9 11 1234-5678 / +54 9 11 9876-5432",
    "+000123456789",
    "+541234567890123456",
  ]) {
    const phone = whatsappPhone(raw);
    assert.equal(phone.WhatsAppNumero, null, String(raw));
    assert.ok(phone.WhatsAppError);
  }
});
test("El enlace wa.me incluye contacto y mensaje exactos, sin permitir cambiar su destino", () => {
  const message = "Hola Ana & Luis\nSaldo: -$1.250,50. {texto} #1? 😊";
  const url = new URL(whatsappMessageUrl("5491112345678", message)!);
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/5491112345678");
  assert.equal(url.searchParams.get("text"), message);
  for (const number of [
    null,
    "",
    "123",
    "javascript:alert(1)",
    "5491112345678?text=otro",
    "+5491112345678",
  ])
    assert.equal(whatsappMessageUrl(number, message), null);
});

test("Recibo de aviso firmado conserva la versión y rechaza cambios o sesiones distintas", async () => {
  const { signMessageSnapshot, readMessageSnapshot } = await import(
    "../apps/api/src/messages/receipt.js"
  );
  const row = {
    Cliente: "C1",
    ClienteNombre: "Ana",
    SaldoTotal: "-123.45",
    FechaHasta: "2026-11-04",
    consultadoEn: "2026-11-04T12:00:00Z",
    Telefono: "11 1234-5678",
    WhatsAppNumero: "5491112345678",
    UltimoAviso: null,
    ...balanceMessage("Ana", "-123.45", "2026-11-04"),
  };
  const token = signMessageSnapshot(row, "session-only-key");
  assert.equal(
    readMessageSnapshot(token, "session-only-key").SaldoTotal,
    "-123.45",
  );
  assert.throws(() => readMessageSnapshot(token, "other-session"));
  const [payload, sig] = token.split(".");
  const changed = JSON.parse(
    Buffer.from(payload!, "base64url").toString("utf8"),
  );
  changed.Cliente = "C2";
  assert.throws(() =>
    readMessageSnapshot(
      Buffer.from(JSON.stringify(changed)).toString("base64url") + "." + sig,
      "session-only-key",
    ),
  );
  assert.throws(() =>
    readMessageSnapshot(token + ".extra", "session-only-key"),
  );
});
