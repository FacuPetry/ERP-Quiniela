# Ordenamiento de listados

DataTable centraliza los encabezados ordenables, sus flechas y el ciclo **descendente → ascendente → predeterminado**. Cambiar de columna empieza por descendente. Los botones admiten mouse, Enter y Espacio; aria-sort comunica el criterio activo. No hay un orden implícito por texto renderizado: fechas, importes y relaciones utilizan valores originales o expresiones declaradas por cada entidad.

## Criterio inicial y restauración

- Cuenta corriente, Cobros y pagos, pendientes y cheques de cartera: IDTabla ascendente, sin mostrar la clave interna. Una apertura de caja se lista también por IDTabla ascendente.
- Maestros: su PK ascendente (IDTabla para Numerador y Codigo para los demás).
- Los maestros con Codigo manual no tienen fecha ni secuencia de creación. Su clave permite un orden consistente, pero no reconstruir cronología de altas sin agregar almacenamiento. Esta revisión no modifica el esquema.
- Las colecciones internas completas, como Afectaciones y Valores del formulario, conservan el orden recibido/incorporado como predeterminado. Ordenarlas no modifica ese arreglo ni el orden de sus escrituras.
- Cada criterio de SQL agrega la PK ascendente como desempate, evitando saltos arbitrarios entre páginas con valores iguales. Al cambiar el criterio se vuelve a página 1; los filtros activos se conservan.

La carga principal continúa siendo manual: Filtrar o Actualizar solicita datos. Los encabezados permanecen deshabilitados hasta solicitar la lista. Navegar a otro módulo empieza sin consultar y sin orden personalizado. Después de guardar o anular se conserva el flujo anterior de actualización y el criterio activo. Ordenar una lista ya consultada es una petición explícita del usuario, no un refresco periódico.

## Reutilización

Para un listado paginado, una columna declara `sort: "Importe"` (la clave pública autorizada en su API). El consumidor utiliza useListSorting, conecta `sort` y `onSortChange` de DataTable, incluye `sorting.query` en la consulta y `sorting.value` en sus dependencias. El hook vuelve a página 1 sin activar una lista aún no solicitada. La búsqueda genérica SearchField pasa el criterio a su adaptador de entidad como cuarto argumento de search; ClientSearch lo envía al endpoint de Clientes.

El backend agrega listOrderFields a su esquema estricto y usa listOrder con un mapa de claves/expresiones constantes del servidor. Se aceptan `orden` y `direccion=asc|desc` juntos; omitir ambos restablece el orden inicial. Una columna desconocida, interna, una dirección inválida o una pareja incompleta devuelve 400. No se interpola ningún nombre ni fragmento SQL recibido por HTTP. ORDER BY se aplica antes de LIMIT/OFFSET y no cambia los filtros, el conteo ni los cálculos financieros.

Los maestros ordenan relaciones por su descripción mediante JOIN; las opciones enumeradas se ordenan por su etiqueta. Importes, enteros y números completos de comprobante se ordenan por la columna numérica SQL. Fecha usa DATE/DATETIME, nunca dd/MM/yyyy. Los números de cheque conservan su almacenamiento textual, pero se convierten a DECIMAL(30,0) para ordenar sus dígitos sin límites de precisión de JavaScript. Estado de Caja usa la misma descripción de confirmación, reversión y revertido que su grilla.

Para una lista que tiene **todos** sus registros en memoria, una columna declara, por ejemplo, `sort: { value: row => row.Importe, type: "number" }`. DataTable ordena una copia estable de la colección y el tercer clic devuelve el arreglo original. Admite text, number y date: money/BIGINT se comparan como decimales exactos, texto con criterio español y fechas ISO/SQL canónicas sin cambios de zona. No proporcionar una página parcial como si fuera una colección local completa.

Sin sort, una columna no se puede ordenar. Acciones, CheckBox de selección y el editor de importe a afectar no se ordenan; este último depende del borrador, no de una columna persistida. Ordenar pendientes/cartera conserva sus selecciones múltiples y los importes parciales entre páginas. Los saldos y totales se calculan a partir del mismo estado anterior, sin consumir ni modificar movimientos al ordenar.

## Archivos

- Base: apps/web/src/components/ui/DataTable.tsx, useListSorting.ts y apps/web/src/masters.css.
- Contrato/comparadores: packages/shared/src/list-sort.ts, exportado desde index.ts.
- SQL y validación comunes: apps/api/src/database/list-order.ts y list-order-validation.ts.
- Consultas y validaciones de masters, current-account y cash-movement.
- Adaptadores: MasterPage, CurrentAccountPage, CashPage, CashActions, CashForm, AllocationPicker, Values, SearchField y ClientSearch.
- Pruebas: tests/list-sort.test.ts, tests/integration/list-order.test.ts y scripts/integration.mjs.

## Prueba manual

1. Entrar a un módulo: debe seguir vacío. Presionar Actualizar y comprobar el orden ascendente por clave.
2. Con más de una página, pasar a la segunda y pulsar Importe o Descripción. Debe volver a la primera página, con flecha descendente y los mayores de todo el conjunto filtrado al principio.
3. Repetir sobre la misma columna: ascendente; repetir nuevamente: orden inicial sin flecha. Pulsar otra columna: inicia descendente y quita la flecha anterior.
4. Aplicar filtros, ordenar y actualizar: comprobar que se mantienen. Probar una fecha que cruce mes/año e importes 2,00 / 10,00 / 100,00 para distinguir comparación real de comparación de texto.
5. En Cuentas bancarias ordenar Banco y comprobar sus nombres; en Cuenta corriente ordenar Cliente y Comprobante por sus descripciones.
6. Abrir pendientes desde Caja, seleccionar un movimiento e ingresar un importe parcial. Ordenar, paginar, volver a la fila y comprobar que sigue seleccionado con su importe. Confirmar y ordenar Afectaciones: el total no cambia. Probar también Valores, cartera, cajas abiertas y resultados de SF.
7. Navegar por los encabezados con Tab y usar Enter/Espacio. En móvil, las flechas se mantienen dentro de la grilla desplazable.

Validación de esta entrega: tipos correctos; 42 pruebas unitarias; integración completa con bases efímeras MySQL 8.4 y MariaDB 11.8.9 (64 pruebas informadas por motor, incluidos filtros, empates, precisión, exclusiones y páginas); Chromium de escritorio/móvil con respuestas HTTP simuladas para el flujo del control. No se ejecutó compilación de producción ni se accedió a Hostinger. No hay migraciones nuevas ni dependencias adicionales.
