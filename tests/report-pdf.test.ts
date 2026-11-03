import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import {
  buildReportDocument,
  reportText,
} from "../apps/web/src/components/reports/report-document.js";
import { createReportPdf } from "../apps/web/src/components/reports/report-pdf.js";

test("PDF semántico usa toda la colección, cortes completos, columnas y orden de saldos", () => {
  const rows = Array.from({ length: 450 }, (_, i) => ({
    key: String(i),
    group: i < 401 ? "A" : "B",
    detail: "Movimiento " + i,
    amount: i === 449 ? "90071992547409.99" : "1.00",
  }));
  const d = buildReportDocument({
    title: "Informe",
    filters: "Filtros aceptados",
    rows,
    rowKey: (r) => r.key,
    columns: [
      {
        key: "detail",
        label: "Detalle",
        render: (r) =>
          createElement("span", { className: "ellipsis" }, r.detail),
      },
      {
        key: "amount",
        label: "Importe",
        align: "right",
        render: (r) => r.amount,
      },
    ],
    grouping: {
      key: (r) => r.group,
      subtotal: (group) => ({
        label: "Subtotal " + group,
        labelKey: "detail",
        values: { amount: group === "A" ? "401,00" : "49,00" },
      }),
    },
    openingBalance: {
      label: "Saldo anterior",
      labelKey: "detail",
      values: { amount: "-899.990,00" },
    },
    totals: {
      label: "Totales del período",
      labelKey: "detail",
      values: { amount: "-649.990,00" },
    },
    closingBalance: {
      label: "Saldo a vencer",
      labelKey: "detail",
      values: { amount: "-674.990,00" },
    },
    closingBalancePlacement: "afterTotals",
  });
  assert.equal(d.rows.filter((r) => r.kind === "detail").length, 450);
  assert.equal(d.rows[402]!.cells[0], "Subtotal A");
  assert.equal(d.rows[452]!.cells[0], "Subtotal B");
  assert.deepEqual(
    d.rows.slice(-2).map((r) => r.cells),
    [
      ["Totales del período", "-649.990,00"],
      ["Saldo a vencer", "-674.990,00"],
    ],
  );
  assert.equal(
    d.rows.find((r) => r.cells[0] === "Movimiento 449")!.cells[1],
    "90071992547409.99",
  );
  assert.equal(d.columns[1]!.align, "right");
});
test("PDF conserva texto completo, filtros, ceros y valores de exportación explícitos", () => {
  assert.equal(
    reportText(
      createElement(
        "div",
        null,
        createElement("p", null, "José · Ñandú"),
        createElement("p", null, "−25,00"),
      ),
    ).trim(),
    "José · Ñandú\n−25,00",
  );
  const d = buildReportDocument({
    title: "Vacío",
    filters: createElement("span", null, "Cliente histórico"),
    rows: [] as { id: string }[],
    columns: [{ key: "x", label: "Datos", render: () => "" }],
    rowKey: (r) => r.id,
    totals: { label: "Total general", labelKey: "x", values: {} },
    notes: createElement("p", null, "Sin operaciones; no equivale a error."),
  });
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0]!.kind, "total");
  assert.equal(d.filters, "Cliente histórico");
  const explicit = buildReportDocument({
    title: "Complejo",
    filters: "",
    rows: [{ id: "1" }],
    rowKey: (r) => r.id,
    columns: [
      {
        key: "x",
        label: "Dato",
        render: () =>
          createElement("input", { value: "oculto", readOnly: true }),
        exportValue: () => "Texto completo 0,00",
      },
    ],
  });
  assert.equal(explicit.rows[0]!.cells[0], "Texto completo 0,00");
});
test("El motor genera un PDF real de varias páginas con fuentes Unicode incrustadas", async () => {
  const regular = await readFile(
    new URL(
      "../apps/web/src/components/reports/pdf-fonts/OpenSans-Regular.ttf",
      import.meta.url,
    ),
  );
  const bold = await readFile(
    new URL(
      "../apps/web/src/components/reports/pdf-fonts/OpenSans-Bold.ttf",
      import.meta.url,
    ),
  );
  const d = buildReportDocument({
    title: "Resumen · José Ñandú",
    filters: "Caja principal · Jornada cerrada",
    rows: Array.from({ length: 501 }, (_, i) => ({ key: String(i) })),
    rowKey: (r) => r.key,
    columns: [
      {
        key: "number",
        label: "Comprobante",
        render: (r) => "REGISTRO-" + r.key.padStart(4, "0"),
      },
      {
        key: "amount",
        label: "Importe",
        align: "right",
        render: () => "−1.234,56",
      },
    ],
    totals: { label: "Total general", values: { amount: "0,00" } },
  });
  const file = await createReportPdf(d, {
    regular: regular.toString("base64"),
    bold: bold.toString("base64"),
  });
  const raw = Buffer.from(await file.blob.arrayBuffer()).toString("latin1");
  assert.equal(file.blob.type, "application/pdf");
  assert.ok(file.name.startsWith("resumen-jose-nandu-"));
  assert.ok(raw.startsWith("%PDF-"));
  assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length > 1);
  assert.match(raw, /\/FontFile2/);
});
