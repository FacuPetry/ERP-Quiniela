# Filtro Caja, rangos comunes y cortes de Informes

Esta entrega ajusta consultas y presentación. No cambia tablas, migraciones, permisos, registración de operaciones ni reglas de saldos financieros.

## Caja en Cobros y pagos

El modal estándar incorpora Caja, con cajas activas e inactivas y la opción Todos. Se sugiere la caja física seleccionada para trabajar, sin restringir a su apertura actual: se consultan sus distintas jornadas dentro de los demás filtros de fecha, estado y búsqueda. La API agrega el parámetro opcional `Caja` y filtra por `CAJASALDO.Caja`, no por un ID de apertura ni por su estado abierto/cerrado.

Seleccionar Caja en filtros no cambia la caja operativa. Se puede cambiar o limpiar el criterio. Mientras el listado no fue consultado ni se está editando el modal, la sugerencia acompaña la caja seleccionada; después de aplicar una consulta se respeta el criterio del usuario, incluso Todos. Cambiar/cerrar la caja operativa no recorta una consulta histórica ya aplicada. La validación operativa de caja abierta continúa igual.

No se cargan movimientos al ingresar ni al abrir el modal. Actualizar utiliza los criterios actuales; Cancelar descarta el borrador. Tesorería conserva sus controles de filtro anteriores, sin agregar Caja a su interfaz en esta entrega.

## Parejas de fechas

`ui/filter-defaults.ts` centraliza `initialDateRange()`: fecha civil actual del negocio menos **30 días calendario**, y fecha actual. Ejemplo: 02/11/2026 → 03/10/2026 a 02/11/2026. La resta civil conserva el criterio entre meses, años y años bisiestos sin depender de la zona horaria del servidor/navegador.

`initialListFilters` recibe las dos claves en orden Desde/Hasta y comparte ese rango con FilterDialog. Una fecha aislada conserva hoy. Cuenta corriente, Cobros y pagos, Tesorería y Valores adoptan el rango desde su inicialización existente; Resumen de Cuenta corriente y Resumen diario usan el mismo helper. El Listado de Cuenta corriente no incorpora fechas que antes no tenía.

Son valores iniciales: reabrir el modal conserva valores aceptados y vacíos explícitos. Limpiar mantiene la semántica existente de cada base: en los listados operativos vacía las fechas; en los informes repone sus filtros iniciales. El usuario puede vaciar cada fecha del informe manualmente. No cambia el valor inicial de Fecha de origen/vencimiento al crear un registro ni ninguna fecha ya almacenada.

## Informes sin detalle

ReportView no inserta mensajes como filas dentro de la tabla. Antes de Aceptar no hay resultados, KPI ni totales; Cancelar tampoco ejecuta una consulta. Después de una respuesta válida vacía se conservan encabezados y el pie de totales configurado por el informe. Los ceros monetarios usan `0,00`; datos no disponibles, como diferencias sin cierre, conservan su representación `—`.

Resumen de Cuenta corriente mantiene Totales del período incluso cuando no hay movimientos ni saldos. Si hay saldos anteriores/posteriores sin detalle, presenta sus valores reales con las reglas de visibilidad existentes, y el cierre del período no incluye los posteriores. No se recalculan ni sustituyen importes por cero a partir de la cantidad de filas. Los errores siguen fuera de la tabla y no generan totales ficticios. Los mensajes vacíos de los ABM operativos no cambian.

## Agrupamiento y subtotales reutilizables

ReportView admite `grouping` opcional con una clave y un proveedor de subtotal. Agrupa la colección completa y marca su última fila real antes de presentar bloques de 200. Solo entonces DataTable agrega el corte informativo, sin selección, acciones ni Propiedades de un registro ficticio. No agrega encabezados de grupo. Los subtotales usan el mismo fondo y peso de letra que Total general.

Resumen diario agrupa por **código canónico de Caja**, mostrando su descripción. Cajas distintas con igual nombre mantienen cortes propios; diferencias de mayúsculas en referencias SQL no separan una misma caja. Los grupos se ordenan por descripción/código y las jornadas por ID ascendente inicialmente. Ordenar una columna conserva los grupos y ordena dentro de cada caja; ordenar Caja invierte el orden de grupos.

La API devuelve `subtotales` por Caja y `totales` generales mediante agregados DECIMAL sobre todo el filtro, en el mismo snapshot de solo lectura que el detalle. Incluso el contrato paginado compatible conserva los agregados completos. El navegador no suma dinero ni utiliza solo las filas visibles. El corte de un grupo con más de 200 jornadas espera a su último registro; el pie general espera al final de todo el informe.

Cada subtotal y el Total general muestran ingresos/egresos físicos y diferencias de cierres completos. No se suman saldos iniciales, teóricos o contados de jornadas sucesivas. Sin cierres, o si algún cierre de ese grupo tiene importes guardados incompletos, su diferencia agregada queda sin informar. Un grupo completo conserva su diferencia aunque otro sea incompleto; el total general tampoco presenta una diferencia parcial como completa. Se conservan las reglas de anulados, originales revertidos y reversos, sin unir relaciones 1:N al agregado monetario.

## Archivos

- API: `apps/api/src/cash-movement/validation.ts`, `store.ts` y `reports/cash.ts`.
- Contrato de informe: `packages/shared/src/reports.ts`.
- Filtros compartidos: `apps/web/src/components/ui/filter-defaults.ts`, `FilterDialog.tsx`; adopción de Caja en `cash-movement/CashPage.tsx`.
- Base de informes y tabla: `reports/ReportView.tsx`, `group-rows.ts`, `reports.css` y `ui/DataTable.tsx`.
- Informes: `reports/DailyCashPage.tsx` y `AccountLedgerPage.tsx`.
- Pruebas: `tests/form-defaults.test.ts`, `report-grouping.test.ts`, `integration/cash-report.test.ts`.
- Documentación: esta guía, README y criterios/guías de informes, valores iniciales y etapa 8.

## Aceptación

1. Seleccionar una caja operativa y entrar a Cobros y pagos: grilla sin consultar; Caja sugerida y rango de 30 días en filtros. Aplicar debe conservar los demás filtros. Probar otra caja, una inactiva con historia y Todos.
2. Ampliar fechas/estado para consultar aperturas anteriores, cerradas y abiertas de esa caja. Filtrar no cambia la caja operativa; cerrar/cambiar la operativa no modifica el filtro ya aceptado. Limpiar y aplicar Todos no vuelve a insertar la caja por sí solo.
3. Revisar el rango inicial en Cuenta corriente, Tesorería, Valores y ambos informes con fechas. Cambiar, vaciar, aplicar, reabrir y cancelar: se conserva lo aceptado. Las fechas de altas siguen sugiriendo hoy.
4. Abrir cada informe y cancelar: no hay totales ni consulta. Ejecutar filtros sin resultados: encabezados y totales presentes, sin mensajes de detalle. En Resumen probar además sin movimientos del período pero con saldos anteriores/posteriores no nulos y contrastar cierre/KPI con la API.
5. Resumen diario con varias cajas y varias aperturas: cada caja contigua termina en un subtotal y el final mantiene Total general. No hay encabezados de grupo. Contrastar `subtotales` y `totales` de la respuesta con ingresos/egresos/diferencias, sin sumar saldos trasladados.
6. Probar cajas de igual descripción, grupos de más de 200 jornadas, orden y filtros: no debe aparecer un corte antes de completar el grupo. Cambiar filtros recalcula todos los cortes. Una fila de subtotal no selecciona un registro ni habilita Propiedades.
7. Revisar una jornada abierta y un cierre sin contado: diferencia no disponible; un grupo completo independiente sigue mostrando su diferencia. Probar permisos de consulta y scroll horizontal interno en móvil.

## Verificación realizada

- TypeScript compartido/API/web correcto y **50 pruebas unitarias** aprobadas.
- Suite completa aislada: **183 pruebas en MySQL y 183 en MariaDB**, sin fallos. Incluye filtros de Caja entre aperturas, agregados por caja sobre todo el filtro, contrato paginado/continuo, precisión, grupos con nombre repetido/referencias de distinta capitalización, cierres incompletos y conservación de operaciones/saldos/auditoría.
- Chromium con API simulada: Caja sugerida, editable/limpiable y conservada tras cerrar la operativa; rangos de fechas; tres informes vacíos con encabezados/pies; saldos reales sin detalle; 250 filas con corte después de 205, estilo de subtotales y scroll móvil sin desborde. Esta revisión de interfaz complementa las pruebas con SQL real.
- Sin build de producción ni comandos sobre Hostinger/base de producción.
