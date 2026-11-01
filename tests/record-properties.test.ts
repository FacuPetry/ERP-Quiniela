import assert from "node:assert/strict";
import { test } from "node:test";
import { masterDefinitions } from "@erp/shared";
import {
  masterPropertyFields,
  loadMasterProperties,
} from "../apps/web/src/components/masters/master-properties.js";

test("Propiedades utiliza los campos funcionales de los ocho maestros, sin IDTabla", () => {
  for (const master of Object.values(masterDefinitions)) {
    const fields = masterPropertyFields(master);
    assert.ok(fields.length > 1);
    assert.ok(!fields.some((field) => field.key === "IDTabla"));
    assert.equal(fields.at(-1)?.key, "Activo");
    assert.deepEqual(
      fields.slice(0, -1).map((field) => field.key),
      master.fields
        .filter((field) => field.name !== "IDTabla")
        .map((field) => field.name),
    );
  }
  const configured = masterPropertyFields({
    ...masterDefinitions.clientes,
    propertyFields: ["Nombre", "IDTabla", "desconocido", "Activo", "Nombre"],
  });
  assert.deepEqual(
    configured.map((field) => field.key),
    ["Nombre", "Activo"],
  );
});
test("Propiedades presenta relaciones, opciones, ceros, vacíos y números completos", () => {
  const data = {
    record: {
      Activo: false,
      ClienteTipo: "TC",
      Nombre: "Prueba",
      Telefono: null,
      Orden: "0",
      ModuloOrigen: "CUENTACORRIENTE",
      ProximoNumero: "100000025",
    },
    descriptions: { ClienteTipo: "Jugador" },
  };
  const value = (master: keyof typeof masterDefinitions, key: string) =>
    masterPropertyFields(masterDefinitions[master])
      .find((field) => field.key === key)!
      .render(data);
  assert.equal(value("clientes", "ClienteTipo"), "Jugador");
  assert.equal(value("clientes", "Telefono"), "—");
  assert.equal(value("clientes", "Activo"), "Inactivo");
  assert.equal(value("comprobantes", "ModuloOrigen"), "Cuenta corriente");
  assert.equal(value("comprobantes", "Orden"), "0");
  assert.equal(value("numeraciones", "ProximoNumero"), "0001-00000025");
});
test("Propiedades carga solo el detalle y la referencia específica, también inactiva", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    assert.ok(init?.signal);
    if (url === "/api/referencias/clientes/00001")
      return Response.json({
        registro: {
          Codigo: "00001",
          Nombre: "Prueba",
          ClienteTipo: "TC",
          Activo: true,
        },
        version: "1",
      });
    assert.equal(url, "/api/referencias/tipos-cliente/TC");
    return Response.json({
      registro: { Codigo: "TC", Descripcion: "Tipo histórico", Activo: false },
      version: "2",
    });
  };
  try {
    const result = await loadMasterProperties(
      masterDefinitions.clientes,
      "00001",
      new AbortController().signal,
    );
    assert.equal(result.descriptions.ClienteTipo, "Tipo histórico");
    assert.equal(requests.length, 2);
    requests.length = 0;
    const master = {
      ...masterDefinitions.clientes,
      propertyFields: ["Nombre"],
    };
    await loadMasterProperties(master, "00001", new AbortController().signal);
    assert.deepEqual(requests, ["/api/referencias/clientes/00001"]);
  } finally {
    globalThis.fetch = original;
  }
});
test("Propiedades propaga fallos de detalle sin inventar registros ni datos relacionados", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      { error: "El registro ya no existe." },
      { status: 404 },
    );
  };
  try {
    await assert.rejects(
      loadMasterProperties(
        masterDefinitions.clientes,
        "00001",
        new AbortController().signal,
      ),
      /ya no existe/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
