# Resumen diario de caja y cierre de los informes de Cuenta corriente

Primera entrega incremental posterior a los dos informes de Cuenta corriente. Se incorpora **solo Resumen diario de caja**; cheques, bancos y el informe separado de Tesorería siguen en el roadmap. No hay nuevas tablas, columnas, migraciones, dependencias o variables de entorno. No se alteran registros de producción.

## Ajustes de Cuenta corriente

- **Resumen:** se quita Cuenta únicamente de las columnas visibles. Sigue disponible en Propiedades y permanece en los datos para interpretar los movimientos. No cambia la tabla financiera, los KPI, el saldo anterior/posterior ni el cierre.
- **Listado:** los mismos saldos actuales ahora se rotulan **Débitos (por cobrar)**, **Créditos (por pagar)** y **Saldo neto**. Son saldos netos de cada cuenta, no débitos/créditos brutos como los del mayor; tampoco sustituyen al pendiente documental, que continúa en Propiedades. Un importe a favor puede seguir siendo negativo.
- **Total general:** utiliza `AccountSummary.totales` de la misma respuesta/snapshot, que suma todos los clientes que cumplen Tipo/Cliente/búsqueda, independientemente de las filas visibles o de la paginación compatible de API. No suma las tarjetas, las afectaciones ni las filas ya renderizadas.
- Listado conserva sus filtros y no incorpora KPI. El total conserva el estilo estándar del pie de Informes.

## Nuevo informe

Menú **Informes → Resumen diario de caja**, URL `/resumen-diario-caja`, API de solo lectura `GET /api/informes/caja/diario`.

Una fila representa **una apertura real CAJASALDO**, incluso si la misma caja abrió/cerró varias veces en el mismo día. Se incluyen cajas activas e inactivas con historia. No se requiere una caja abierta o seleccionada para consultar.

Columnas: Caja, Apertura, Cierre, Estado, Saldo inicial, Ingresos de efectivo, Egresos de efectivo, Efectivo teórico, Efectivo contado y Diferencia. Fechas/horas en Buenos Aires; importes exactos con formato argentino. El ID de apertura es interno.

Propiedades muestra además responsables de apertura/cierre, observación, cantidad de movimientos, efectivo comercial, efectivo interno de Tesorería y otros medios ingresados/entregados como información. Los desgloses son por dirección y contemplan también los reversos.

Se reutiliza ReportView: filtros iniciales en modal, sin consulta hasta Aceptar, cancelar conserva criterios/resultados aceptados, orden dentro de cada caja, scroll continuo/horizontal, Propiedades y totales. No se agregan KPI al nuevo informe.

### Filtros

- **Caja:** opcional, DropDown histórico con Todos.
- **Estado de jornada:** Todos, Abierta o Cerrada. Predeterminado Todos.
- **Fecha de apertura desde/hasta:** hoy menos 30 días calendario y hoy, respectivamente, modificables/limpiables, extremos inclusivos en el día civil del negocio.

Las fechas filtran **AperturaEn**, no FechaOrigen de los comprobantes ni la fecha de cierre. Si una apertura cumple el rango, se incluyen todos sus movimientos. Una jornada abierta puede atravesar medianoche. Los límites UTC se obtienen con la zona America/Argentina/Buenos_Aires, sin depender del TZ del servidor ni de tablas horarias instaladas en MySQL.

La API acepta `continuo=1` para todos los resultados, además del contrato opcional pagina/limite usado por los otros informes. El orden predeterminado agrupa por descripción de Caja (con código como desempate) y luego por identificador de apertura ascendente. Ordenar otra columna conserva los grupos y ordena sus jornadas internamente; ordenar Caja invierte el orden de los grupos. Las expresiones del servidor están permitidas explícitamente y tienen desempate estable.

### Fórmulas y conservación del cierre

Solo se consideran movimientos no anulados. Los originales revertidos mantienen su efecto en su jornada; sus reversos actúan en la apertura en que se registraron.

- **Ingresos/Egresos de efectivo:** sumas de CAJAMOVIMIENTO.ImporteEfectivo según su Sentido, incluyendo Cobros/pagos y Tesorería.
- **Teórico calculado:** SaldoInicial + IngresosEfectivo − EgresosEfectivo.
- **Jornada abierta:** muestra el teórico calculado; Contado y Diferencia quedan sin informar.
- **Jornada cerrada:** muestra SaldoTeorico y SaldoContado guardados al cerrar. Diferencia = Contado − Teórico guardado. No sustituye un cierre histórico por un recálculo actual.
- Propiedades permite comparar el teórico guardado con el calculado. Si no coinciden, lo informa; no corrige ni modifica el cierre. Si falta un importe histórico se presenta como no disponible, nunca como cero.
- **Otros medios (informativo):** ImporteTotal − ImporteEfectivo por sentido. Incluye los medios no físicos de la operación, sin sumarlos al efectivo de caja ni presentarlos como saldo bancario disponible.

La clasificación comercial/Tesorería comparte el mismo predicado SQL que las operaciones: ausencia de cliente y de asiento comercial identifica fondos internos. No utiliza la configuración mutable del comprobante para reclasificar historia. La extracción a `database/cash-scope.ts` conserva el criterio operativo existente.

No se unen afectaciones, eventos ni valores en el agregado monetario. Una operación con dos documentos y tres medios cuenta una sola vez. El resumen de movimientos se agrupa por CajaSaldo antes de unirse a cada apertura.

### Totales

Cada caja termina con **Subtotal · descripción** y el pie conserva **Total general**: ingresos de efectivo, egresos de efectivo y suma de diferencias de cierres completos del filtro. No se suman Saldo inicial, Teórico o Contado de jornadas sucesivas: el mismo efectivo puede trasladarse de un saldo final al inicial siguiente y se contaría varias veces.

Sin cierres, el total de diferencias se muestra como — (no disponible). Si algún cierre del filtro carece de importes guardados, tampoco se informa un total parcial como si estuviera completo. La nota muestra cantidad de jornadas abiertas/cerradas y movimientos.

Se agrupa por la identidad real de Caja, incluso si dos cajas tienen la misma descripción. La API devuelve `subtotales` con Caja, CajaNombre, Jornadas y los mismos agregados de flujos/diferencias que `totales`; ambos abarcan todos los registros filtrados, no solo las filas visibles. Un grupo incompleto por scroll no presenta su corte hasta llegar a su última jornada. Lecturas y conteos comparten snapshot REPEATABLE READ / READ ONLY. Los importes se agregan con DECIMAL y se transportan como texto, sin sumas monetarias con Number.

## Permisos

Nuevo permiso independiente **Resumen diario de caja** (`resumen-diario-caja`), únicamente de consulta. Administrador accede automáticamente; otros usuarios se habilitan desde Usuarios. No se concede automáticamente a quienes tenían permisos anteriores.

La API exige sesión y ese permiso. La referencia auxiliar de Cajas permite cargar el filtro y no otorga acceso al maestro ni a Cobros/pagos/Tesorería. No se agregan acciones financieras en este informe.

## Archivos

- Backend: `apps/api/src/reports/cash.ts` (nuevo), `store.ts`, `routes.ts`, `validation.ts`.
- Clasificación compartida: `apps/api/src/database/cash-scope.ts` (nuevo) y su uso en `cash-movement/store.ts`.
- Permisos auxiliares: rutas de Usuarios/Referencias y `packages/shared/src/permissions.ts`.
- Contratos: `packages/shared/src/reports.ts`.
- Interfaz: `DailyCashPage.tsx` (nuevo), `AccountSummaryPage.tsx`, `AccountLedgerPage.tsx`; navegación en `navigation.ts`/`Workspace.tsx`.
- Pruebas: `tests/integration/cash-report.test.ts` (nuevo) y registro en `scripts/integration.mjs`.

## Prueba de aceptación

1. Resumen de Cuenta corriente: Cuenta no aparece en la tabla, sí en Propiedades. Comparar los mismos KPI y totales con la versión anterior.
2. Listado: revisar nuevos encabezados, importes positivos/negativos, filtros por Tipo/Cliente y Total general. Con más de 200 clientes, el pie debe aparecer al final con el total completo, sin cambiar al ir mostrando más filas.
3. Habilitar el permiso del nuevo informe a un usuario de consulta y comprobar que no gana acceso a los otros módulos.
4. Entrar a Resumen diario de caja: modal inicial, ningún resultado consultado hasta aceptar, Fecha de apertura desde = hoy menos 30 días y hasta = hoy. Probar Caja histórica, Todos/Abierta/Cerrada, rango inválido y Cancelar.
5. Ejemplo: apertura 0; aporte de Tesorería 100; cobro 300 con efectivo 50, transferencia 100 y cheque 150; pago en efectivo 60; retiro 10; otro pago por transferencia 100. El teórico debe ser **80**, ingresos físicos **150** y egresos físicos **70**. Propiedades: otros medios ingresados 250 y entregados 100. Los medios no físicos no cambian esos 80.
6. Registrar/anular un pago extra en la misma apertura: no debe incidir ni contarse como movimiento vigente.
7. Cerrar con contado 75: teórico 80, contado 75, diferencia −5. Abrir nueva jornada con 200 y revertir el cobro anterior (efectivo 50) y el aporte (100): nueva jornada teórico 50, cierre anterior intacto. Los totales de flujos de ambas son ingresos 150/egresos 220, sin sumar sus saldos iniciales o finales.
8. Probar dos aperturas de la misma caja, límites de día de Buenos Aires y movimientos con otra FechaOrigen: la selección depende de la apertura real, no de la fecha de cada comprobante.
9. Probar varias cajas, dos cajas de igual descripción y grupos de más de 200 jornadas: un corte por caja al final real, sin encabezados de grupo, y Total general sin duplicar saldos. Revisar orden descendente/ascendente/restablecer dentro de los grupos, Propiedades, scroll horizontal en móvil, ausencia de ID visibles y de KPI en el nuevo informe.

Las pruebas aisladas MySQL/MariaDB verifican los circuitos financieros reales anteriores, precisión decimal, cierres incompletos, filtros por zona horaria, permisos, continuidad/orden y ausencia de escrituras. La comprobación de tipos y la revisión Chromium con API simulada complementan la validación. No se ejecutan comandos sobre Hostinger ni una base de producción.

La entrega de [filtros y cortes reutilizables](filtros-caja-agrupamiento-informes.md) incorpora estos subtotales, el rango común de 30 días y la presentación vacía con encabezados y totales. No hay nuevas migraciones ni cambios financieros.
