# Listado de saldos y Resumen de Cuenta corriente

Entrega sobre la base de Informes existente. No agrega tablas, columnas, migraciones ni escrituras financieras. Mantiene los filtros iniciales, SF, Propiedades, tabla limpia y scroll horizontal.

## Listado de Cuenta corriente

Es el informe de saldos por cliente que antes se llamaba Resumen. Conserva su URL `/informes-cuenta-corriente`, su API `GET /api/informes/cuenta-corriente` y el permiso `informes-cuenta-corriente`. Los usuarios que ya lo tenían habilitado conservan acceso.

- Se eliminan los tres KPI superiores. La tabla conserva Código, Cliente, Saldo por cobrar, Saldo por pagar y Saldo neto; siguen disponibles los pendientes documentales y créditos sin aplicar en Propiedades.
- **Tipo de cliente** es el primer filtro, mediante DropDown. Es opcional (Todos), incluye tipos históricos/inactivos y consulta la clasificación actual del cliente en su maestro.
- **Cliente** es secundario y opcional, mediante SF. La búsqueda se limita al tipo elegido. Cambiar Tipo limpia Cliente para evitar una selección incompatible. El backend aplica ambos criterios conjuntamente.
- No cambian las fórmulas: el nuevo criterio agrega una condición por CLIENTE.ClienteTipo. Se preservan orden, paginación y la respuesta de totales del servicio, aunque ya no se presenten como KPI.

## Nuevo Resumen: mayor de un cliente

URL `/resumen-cuenta-corriente`; API de lectura `GET /api/informes/cuenta-corriente/resumen?Cliente=CODIGO&pagina=1` (limite opcional, 1–100). Cliente es obligatorio y se selecciona por SF, incluyendo clientes inactivos con historia. Sin selección válida no se consulta. Entrar/cancelar/reabrir conserva el ciclo de ReportView.

Esta primera versión consulta **todo el historial registrado con incidencia sobre el saldo vigente**. No tiene filtro temporal: mostrar un rango sin saldo inicial y sin reconstruir las correcciones históricas produciría un mayor incompleto. No es una reconstrucción de lo que se veía antes de cada anulación ni un saldo a fecha de corte.

### Convención de Débito/Crédito

El saldo acumulado mantiene la convención del neto del Listado: **saldo de Cobrar menos saldo de Pagar**. No compensa automáticamente esas cuentas.

| Cuenta | Naturaleza guardada | Ejemplo | Columna del mayor |
|---|---|---|---|
| Cobrar | Deuda | Apuesta o deuda por cheque rechazado | Débito |
| Cobrar | Crédito | Cobro, anticipo o crédito manual | Crédito |
| Pagar | Deuda | Premio pendiente | Crédito |
| Pagar | Crédito | Pago de premio | Débito |

Débito aumenta el neto a cobrar; Crédito lo disminuye. La columna Cuenta y las Propiedades conservan la naturaleza registrada, sin modificar la configuración de comprobantes. Propiedades muestra también el saldo acumulado separado de Cobrar y Pagar.

Ejemplo: apuesta 100 → saldo 100; premio 80 → saldo 20; cobro 60 → saldo -40; pago 30 → saldo -10. Al final, Cobrar es 40 y Pagar es 50; el neto -10 es informativo.

### Filas y relaciones

- Una fila por asiento real de CUENTACORRIENTE: incluye altas manuales, créditos internos de cobros/pagos, contradeudas de reversión y deudas por rechazo de cheques.
- Los anulados se muestran identificados, con Débito/Crédito cero. Su importe original, fecha/motivo de anulación y operación se conservan en Propiedades. No se inventa otro asiento para anularlos.
- Un original revertido conserva su efecto junto con la contrapartida. La interfaz distingue Revertido y Confirmado · Reversión, con la identificación de ambos movimientos en Propiedades.
- Afectaciones parciales/totales y valores se consultan en Propiedades como **información relacionada**, sin crear otras filas monetarias. Se identifica el documento y el cobro/pago por descripción/número, fecha, importe aplicado y vigencia.
- Las afectaciones de originales revertidos se conservan según el circuito vigente: el documento original no se reabre además de generar la contradeuda. Una aplicación de una operación anulada se muestra sin efecto.
- Se muestran cheques/transferencias de la operación y de los cobros/pagos relacionados con el documento. El importe de un valor es el total del instrumento/medio, no una porción atribuida al documento; no debe sumarse otra vez. Se conserva el estado actual del valor. La historia bancaria completa continúa en Valores.
- La deuda por rechazo identifica el cheque y su Recibo original. Depósito y acreditación no agregan otra incidencia a Cuenta corriente; el rechazo sí tiene su propio asiento de deuda.
- No se incluyen ingresos/retiros internos de Tesorería, porque no tienen asiento comercial de cliente.

### Orden, precisión y totales

Fecha de origen ascendente, luego IDTabla numérico ascendente como desempate estable. El identificador es interno y no se muestra. No se permite cambiar ese orden en el mayor, porque invalidaría la lectura de su progresión.

Una ventana SQL calcula los saldos sobre todos los asientos del cliente **antes** de LIMIT/OFFSET. Cada página conserva el acumulado correcto. Los importes se calculan como DECIMAL y viajan como texto, incluyendo sumas que exceden la precisión de Number.

El pie muestra Total de débitos, Total de créditos y Saldo final de **todo el cliente**, también al paginar. La nota indica los saldos finales separados de Cobrar/Pagar. Los totales se distinguen con fondo suave y negrita, sin divisorias de grilla.

La consulta usa una transacción de solo lectura con snapshot para cliente, cantidad, totales, filas, afectaciones y valores. Las relaciones 1:N se cargan aparte de la consulta monetaria, evitando multiplicar un cobro por sus afectaciones o medios.

## Permisos

El nuevo Resumen tiene permiso independiente `resumen-cuenta-corriente`, exclusivamente de consulta. Administrador lo ve automáticamente. Para otros usuarios debe habilitarlo desde Usuarios; tener permiso del Listado anterior no concede este nuevo informe, ni a la inversa.

Las búsquedas auxiliares de Cliente y Tipo tienen acceso acotado según el informe autorizado. No conceden acceso a los ABM de Clientes/Tipos ni a las operaciones de caja. La API valida los permisos en cada consulta.

## Acordeón del menú

Solo puede estar abierta una categoría: abrir otra cierra la anterior; volver a presionar la actual la cierra. Todas comienzan contraídas al ingresar. Los submenús tienen 18 px de sangría en el sidebar expandido y en móvil; el modo compacto conserva sus íconos centrados. No cambian anchos, rutas, selección, tooltips ni permisos.

## Componentes y archivos

- Reportes: `apps/api/src/reports/ledger.ts` (nuevo), `store.ts`, `routes.ts`, `validation.ts`; contratos en `packages/shared/src/reports.ts`.
- Interfaz: `AccountLedgerPage.tsx` (nuevo Resumen), `AccountSummaryPage.tsx` (Listado), `ReportView.tsx`, `reports.css` dentro de `apps/web/src/components/reports`.
- Base: `DataTable.tsx` agrega un pie opcional configurable; ReportView lo transmite. Las grillas existentes sin pie mantienen su comportamiento.
- Filtros: ClientSearch admite Tipo opcional; ReferenceSelect/referenceOptions admiten consultas históricas de forma opcional. Los ABM siguen usando activos por defecto.
- Permisos/rutas de apoyo: `packages/shared/src/permissions.ts`, rutas de Usuarios y Referencias; navegación en `navigation.ts`/`Workspace.tsx`.
- Menú: `SidebarNavigation.tsx` y `styles.css`.
- Verificación: `tests/integration/account-ledger.test.ts` y registro en `scripts/integration.mjs`.

## Prueba de aceptación

1. Abrir Operaciones y luego Maestros: solo debe quedar Maestros abierto. Volver a presionarlo cierra la categoría. Revisar sangría, seleccionado, menú compacto y móvil.
2. Abrir Listado de Cuenta corriente: filtros iniciales sin consulta automática, Tipo primero y Cliente opcional. Probar Todos, un tipo activo, uno inactivo y un cliente de ese tipo. Cambiar Tipo limpia Cliente. Al aceptar no deben aparecer KPI.
3. Habilitar Resumen para un usuario de consulta desde Usuarios. Verificar que puede abrir solo los informes autorizados y que no se concede acceso a otros módulos/API.
4. En Resumen, cancelar la primera vez debe dejar vacío. Intentar aceptar sin Cliente o con texto sin selección no consulta; seleccionar por lupa habilita el resultado.
5. Cargar apuesta 100, premio 80, cobro aplicado 60 y pago aplicado 30. Comprobar Débitos 130, Créditos 140, saldo final -10; Cobrar 40 y Pagar 50. El orden debe ser Fecha/identificador estable y no presentar orden alternativo.
6. Probar un cobro con dos documentos y varios medios: debe tener una sola incidencia monetaria. En Propiedades revisar afectaciones e instrumentos completos. Consultar un anticipo y un crédito manual: reducen el saldo una sola vez.
7. Anular un pago: conserva fila/importe original e información, con incidencia cero. Revertir un cobro de jornada cerrada: conserva el crédito original y suma una contradeuda. El saldo final debe coincidir con el Listado, sin reabrir dos veces la deuda.
8. Consultar un cheque rechazado: identificar deuda, número e instrumento/Recibo relacionado, sin descontar nuevamente su acreditación ni sus aplicaciones.
9. Probar suficientes filas para varias páginas: acumulados y totales globales no se reinician por página. Revisar pie, importes, Propiedades y scroll horizontal en móvil.

La integración aislada MySQL/MariaDB verifica circuitos reales, pagos parciales, cobros multimedio/multiafectación, anulaciones, reversión, anticipos/créditos independientes, rechazos, precisión, cliente inactivo, orden/paginación, permisos y ausencia de escrituras en las tablas financieras. Chromium con API simulada comprueba navegación, filtros, selección, totales y visualización; no sustituye la validación del cliente en Hostinger/Safari.
