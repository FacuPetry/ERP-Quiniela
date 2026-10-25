import assert from "node:assert/strict";
import { test } from "node:test";
import {
  masterRecordKey,
  masterDefinitions,
  ModuloComprobante,
  CuentaComprobante,
  NaturalezaComprobante,
  SentidoFondosComprobante,
  type MasterDefinition,
} from "@erp/shared";
import { recordSchema } from "../apps/api/src/masters/validation.js";

// Un contrato de prueba verifica la infraestructura sin fijar opciones de negocio.
const master: MasterDefinition = {
  key: "cajas",
  title: "Prueba",
  singular: "prueba",
  description: "",
  primaryKey: "IDTabla",
  columns: ["IDTabla", "Numero"],
  fields: [
    {
      name: "IDTabla",
      label: "Identificador",
      maxLength: 19,
      required: true,
      kind: "integer",
      minimum: "1",
      maximum: "9223372036854775807",
    },
    {
      name: "Numero",
      label: "Número",
      maxLength: 19,
      required: true,
      kind: "integer",
      minimum: "1",
      maximum: "9223372036854775807",
    },
    {
      name: "Orden",
      label: "Orden",
      maxLength: 11,
      kind: "integer",
      minimum: "-2147483648",
      maximum: "2147483647",
    },
    {
      name: "Opcion",
      label: "Opción",
      maxLength: 10,
      required: true,
      kind: "select",
      options: [{ value: "VALIDA", label: "Válida" }],
    },
  ],
};
const input = {
  Numero: "9007199254740993",
  Orden: "",
  Opcion: "VALIDA",
  Activo: true,
};

test("El ABM conserva BIGINT exactos, normaliza enteros y permite orden opcional", () => {
  const result = recordSchema(master, true).parse(input);
  assert.equal(result.Numero, "9007199254740993");
  assert.equal(result.Orden, null);
  assert.equal(result.IDTabla, "");
  assert.equal(
    recordSchema(master, true).parse({ ...input, Numero: "00001", Orden: "-1" })
      .Numero,
    "1",
  );
  for (const Numero of [
    "0",
    "-1",
    "1.5",
    "1e3",
    "9223372036854775808",
    "NaN",
    "",
  ]) {
    assert.equal(
      recordSchema(master, true).safeParse({ ...input, Numero }).success,
      false,
      Numero,
    );
  }
  assert.equal(
    recordSchema(master, true).safeParse({ ...input, Numero: 1 }).success,
    false,
  );
  assert.equal(
    recordSchema(master, true).parse({
      ...input,
      Numero: "9223372036854775807",
    }).Numero,
    "9223372036854775807",
  );
});

test("El ABM distingue la PK generada, exige su conservación y valida opciones", () => {
  assert.equal(
    recordSchema(master, true).safeParse({ ...input, IDTabla: "123" }).success,
    false,
  );
  assert.equal(recordSchema(master).safeParse(input).success, false);
  const existing = recordSchema(master).parse({
    ...input,
    IDTabla: "9007199254740995",
  });
  assert.equal(masterRecordKey(master, existing), "9007199254740995");
  assert.equal(Object.hasOwn(existing, "Codigo"), false);
  assert.equal(
    recordSchema(master, true).safeParse({ ...input, Opcion: "OTRA" }).success,
    false,
  );
  assert.equal(
    recordSchema(master, true).safeParse({ ...input, Orden: "2147483648" })
      .success,
    false,
  );
});

test("Las opciones de Comprobantes cubren exactamente los enums compartidos", () => {
  const catalogs = {
    ModuloOrigen: ModuloComprobante,
    Cuenta: CuentaComprobante,
    Naturaleza: NaturalezaComprobante,
    SentidoFondos: SentidoFondosComprobante,
  };
  for (const [name, enumeration] of Object.entries(catalogs)) {
    const field = masterDefinitions.comprobantes.fields.find(
      (field) => field.name === name,
    )!;
    assert.deepEqual(
      field.options!.map((option) => option.value).sort(),
      Object.values(enumeration).sort(),
    );
  }
});
