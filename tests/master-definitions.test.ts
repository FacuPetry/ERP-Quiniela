import assert from "node:assert/strict";
import { test } from "node:test";
import { masterDefinitions } from "@erp/shared";

test("Las referencias visibles en las grillas definen un campo descriptivo válido", () => {
  for (const master of Object.values(masterDefinitions)) {
    for (const name of master.columns) {
      const field = master.fields.find((candidate) => candidate.name === name);
      assert.ok(field, `${master.key}.${name}: columna sin definición`);
      if (field.kind !== "relation" && !field.relation) continue;
      const context = `${master.key}.${name}`;
      assert.ok(field.relation, `${context}: falta la entidad relacionada`);
      assert.ok(
        field.relationLabelField,
        `${context}: falta el campo descriptivo de la relación`,
      );
      const related = masterDefinitions[field.relation];
      assert.ok(
        related.fields.some(
          (candidate) => candidate.name === field.relationLabelField,
        ),
        `${context}: el campo descriptivo no existe en ${field.relation}`,
      );
      assert.notEqual(
        field.relationLabelField,
        "Codigo",
        `${context}: mostrar una descripción, conservando la FK interna`,
      );
    }
  }
});
