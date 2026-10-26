import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeVoucher,
  formatVoucher,
  voucherParts,
  voucherNumberError,
  nextVoucher,
} from "@erp/shared";

test("Comprobantes: ejemplos acordados, ceros y recuperación exacta del BIGINT", () => {
  for (const [point, counter, stored, formatted] of [
    ["0001", "00000025", "100000025", "0001-00000025"],
    ["0002", "00000150", "200000150", "0002-00000150"],
    ["0012", "00000001", "1200000001", "0012-00000001"],
    ["0000", "00000025", "25", "0000-00000025"],
    ["9999", "99999999", "999999999999", "9999-99999999"],
  ]) {
    assert.equal(encodeVoucher(point!, counter!), stored);
    assert.equal(formatVoucher(stored!), formatted);
    assert.deepEqual(voucherParts(stored!), { point, counter });
    assert.equal(voucherNumberError(stored!), undefined);
  }
  for (const point of ["0", "1", "12", "9999"])
    for (const counter of ["1", "25", "150", "99999999"]) {
      const stored = encodeVoucher(point, counter),
        parts = voucherParts(stored);
      assert.equal(encodeVoucher(parts.point, parts.counter), stored);
    }
  assert.equal(formatVoucher("0"), "0000-00000000");
  assert.equal(formatVoucher(null), "Sin número");
});
test("Comprobantes: valida el dominio y no cambia el punto de venta al agotarse", () => {
  for (const value of [
    "0",
    "100000000",
    "1000000000000",
    "-1",
    "1.5",
    "0001-00000025",
    "abc",
    "",
  ])
    assert.ok(voucherNumberError(value), value);
  assert.equal(nextVoucher("100000025"), "100000026");
  assert.equal(nextVoucher("199999999"), null);
  assert.equal(nextVoucher("999999999999"), null);
  assert.throws(() => encodeVoucher("10000", "1"));
  assert.throws(() => encodeVoucher("1", "100000000"));
});
