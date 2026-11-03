# INF-09 · Detalle de movimientos por caja/jornada y PDF de Informes

Entrega de consulta y exportación. No crea tablas ni migraciones, no cambia el cierre transaccional ni registra ajustes de caja/bancos. INF-06 incorpora PDF e impresión desde el visor; Excel/CSV permanecen pendientes.

## Detalle de una apertura real

Menú **Informes → Detalle de movimientos por caja/jornada**, ruta `/detalle-movimientos-caja`. Filtros obligatorios Caja y Jornada, con cajas históricas/inactivas y aperturas abiertas/cerradas. Se sugiere la apertura operativa seleccionada si existe; el usuario puede elegir otra. Elegir Caja carga sus opciones de jornada, sin consultar movimientos hasta Aceptar. No se exige tener caja abierta para consultar historia.

Cada jornada se identifica por su **CAJASALDO.IDTabla**, no por fecha ni por la caja actualmente activa. La fecha de apertura/cierre y sus responsables identifican la selección en la cabecera del resultado/PDF. El identificador interno no se incorpora como columna visible. Todas las opciones de jornada se incluyen, sin recortes silenciosos; el número de opción solo ayuda a distinguir aperturas del selector.

Se muestran todas las operaciones válidas de la apertura, tanto comerciales como internas de Tesorería, incluidas las de efectivo cero que usaron valores/transferencias. Columnas: Registro, Fecha de origen, Comprobante, Número, Cliente/Concepto/Detalle, Responsable, Ingresos de efectivo, Egresos de efectivo, Otros medios (+/−) y Saldo de efectivo. Propiedades agrega tipo de movimiento, estado, importe total y vínculo descriptivo con el original de una reversión.

El orden fijo es **CreadoEn ascendente, ID ascendente**: reconstruye la secuencia de registro y desempata operaciones simultáneas. Fecha de origen se muestra separada y no recorta ni reordena la jornada; puede ser anterior/posterior a su apertura. No se habilita ordenar columnas de este mayor para evitar una secuencia visual de saldos desconectada del registro.

### Importes y cierre guardado

- Saldo inicial se presenta como fila informativa.
- Ingresos/egresos consideran únicamente `ImporteEfectivo`, según sentido. El saldo acumulado es SaldoInicial más esos ingresos menos esos egresos, mediante ventana DECIMAL SQL.
- Otros medios (+/−) es `ImporteTotal − ImporteEfectivo`, positivo para ingreso y negativo para egreso. Es información nominal de medios no físicos; no altera el saldo de efectivo ni representa disponibilidad bancaria.
- Totales de movimientos presenta flujos completos, neto de otros medios y teórico calculado, sin sumar los saldos acumulados de las filas.
- En una jornada cerrada se agregan Teórico guardado, Efectivo contado y Diferencia guardada (contado menos teórico guardado). Si faltan importes históricos, se muestra `—`, sin inventar ceros.
- Si el recálculo no coincide con el teórico histórico, se muestran ambos y una aclaración; no se corrige el cierre.
- Una jornada vacía conserva Saldo inicial y los totales reales. Una jornada abierta todavía no tiene contado/diferencia de cierre.

Se excluyen anulados con la política común de Informes. El original revertido conserva su incidencia en la apertura original; la contrapartida aparece en su apertura real. No se unen afectaciones, cheques o transferencias 1:N al detalle ni a sus sumas. La clasificación Tesorería comparte el predicado por datos persistidos del módulo operativo, sin depender del módulo actual del comprobante.

API `GET /api/informes/caja/jornadas?Caja=CODIGO` para opciones y `GET /api/informes/caja/detalle?CajaSaldo=ID&Caja=CODIGO` para el informe completo. Caja es opcional en esta última ruta cuando se conoce la apertura exacta, como en el cierre; si se suministra se valida su correspondencia. No hay paginación/remuestreo de consultas para reconstruir un saldo. Apertura, flujos, detalle y totales comparten snapshot REPEATABLE READ / READ ONLY. Se reutiliza la consulta del Resumen diario en esa misma conexión para conservar sus reglas de cierre.

## PDF en la base de Informes

ReportView incorpora **Exportar a PDF**, con icono PDF, tooltip y sin descripción permanente. Se deshabilita antes de consultar, durante carga o ante error de consulta. Usa los datos y filtros aceptados; cancelar un borrador de filtros no cambia el archivo. Una nueva consulta descarta el enlace previo; una exportación que queda obsoleta por cambiar consulta o salir de la pantalla no descarga resultados ajenos.

El documento semántico se forma desde la **colección completa** de la respuesta, no desde el DOM ni las 200 filas inicialmente renderizadas. Comparte columnas/formato, orden de saldos informativos, cortes por grupo y totales de la pantalla. No calcula dinero ni cambia el cierre del período por la ubicación de una fila. Una respuesta vacía válida exporta encabezados y totales; un error no genera un documento ficticio de ceros.

El motor genera texto vectorial seleccionable, con título, filtros, fecha/hora de emisión del negocio, columnas, detalles, subtotales/totales destacados, aclaraciones y numeración de páginas. Repite encabezados y conserva el contenido completo de descripciones. Usa A4 vertical para tablas pequeñas, A4 apaisado para intermedias y A3 apaisado desde nueve columnas. Si necesita paneles horizontales, repite la identificación y los rótulos de saldos/cortes. El visor permite ajustar una hoja ancha al papel disponible al imprimir.

Se usan `jspdf` y `jspdf-autotable`, cargados al exportar, y fuentes Open Sans normal/negrita alojadas con la aplicación (licencia incluida). No hay llamadas a servicios externos, capturas de pantalla ni dependencias de Chromium en Hostinger. Los importes siguen siendo texto exacto ya formateado; las fuentes admiten acentos, eñes y signos monetarios/menos del sistema.

`TableColumn.exportValue` permite aportar texto completo si una columna futura renderiza un control o componente complejo. Los informes actuales se exportan desde sus columnas de presentación. Propiedades e información oculta fuera de esas columnas no se vuelcan automáticamente al PDF.

La descarga conserva además los enlaces **Descargar PDF** y **Abrir para imprimir**, útiles cuando un navegador móvil exige otro gesto explícito. La impresión se realiza abriendo el mismo PDF en el visor y usando Imprimir/Compartir del dispositivo; no se crea otro motor ni una tabla paralela para impresión. Si falla una fuente o la generación, la consulta permanece y se puede reintentar exportar.

## Cerrar caja con o sin informe

Ambas acciones llaman al **mismo `cashClose` existente**, con idéntico cuerpo, CSRF, idempotencia y validaciones de cierre:

1. **Cerrar caja:** confirma normalmente, sin consultar/generar documento.
2. **Cerrar caja y emitir informe:** captura el ID de la apertura, confirma el mismo cierre y solo después consulta/genera su PDF. No usa la próxima apertura ni la caja que se seleccione luego.

La emisión comparte con el menú la misma API de detalle, columnas, saldos, totales, notas, modelo de documento y motor de PDF. El ID devuelto por la consulta debe coincidir con el solicitado y su estado debe ser Cerrado. No se vuelve a enviar el POST de cierre al reemitir.

Un fallo de consulta/generación/descarga se informa como **cierre confirmado con emisión fallida**, no como cierre fallido. Permanece una acción para Volver a emitir informe de esa jornada, incluso después de seleccionar otra apertura. También puede reemitirse desde Informes. Los errores de cierre continúan impidiendo la emisión. Un reintento de red del cierre conserva su idempotencia previa.

No se guarda un PDF inmutable en la base ni se revierte un cierre por fallar su archivo. Reemitir consulta la información vigente de la misma apertura y conserva sus importes históricos guardados. El enlace del archivo preparado vive en esa pantalla, sin alterar la caja seleccionada.

## Permisos

Nuevo permiso **Detalle de movimientos por caja/jornada** (`detalle-movimientos-caja`), solo Consulta. Administrador accede automáticamente; el resto se habilita explícitamente en Usuarios. No habilita caja, Tesorería, maestros ni los otros informes. Las referencias auxiliares de Caja se limitan a sus datos de selección.

Para Cerrar caja y emitir informe se necesitan los permisos operativos que ya permitían cerrar y el permiso de este informe. Sin este último se conserva Cerrar caja y se oculta la emisión. La API valida el permiso de consulta, sin concederlo implícitamente por trabajar en caja. Exportar otros informes conserva el permiso de cada consulta existente.

## Archivos principales

- API: `reports/cash-journey.ts`, `cash.ts`, `routes.ts`, `store.ts`, `validation.ts`; autorización en Usuarios/Referencias. El servicio financiero `cash-movement/store.ts` y el endpoint de cierre no se modifican.
- Contratos y menú: `packages/shared/src/reports.ts`, `permissions.ts`; `navigation.ts` y `Workspace.tsx`.
- Web: `reports/CashJourneyPage.tsx`, `cash-journey-report.tsx`, `ReportView.tsx`, `report-document.ts`, `report-pdf.ts`, `PdfDownload.tsx`, `pdf-fonts/` y `public/licenses/open-sans/`; `Icon.tsx`, `ui/DataTable.tsx`; integración en `cash-movement/CashActions.tsx`/`CashPage.tsx`.
- Dependencias: `apps/web/package.json` y `package-lock.json`.
- Pruebas: `tests/report-pdf.test.ts` y ampliación de `tests/integration/cash-report.test.ts`.
- Documentación: esta guía, criterios comunes, README y roadmap.

## Aceptación antes del PR

1. Habilitar el nuevo informe a un usuario de consulta; entrar desde Informes y elegir Caja/Jornada. No deben consultarse movimientos antes de aceptar. Probar otra apertura del mismo día, una cerrada y una caja inactiva con historia.
2. Comparar con Resumen diario: inicial, ingresos/egresos físicos, teórico, contado y diferencia. Usar un cobro con varias afectaciones/medios y un pago por transferencia: una fila por operación y sin duplicación ni consumo de efectivo por medios no físicos.
3. Probar un anulado, un original revertido y su reverso en otra jornada. Revisar importes, secuencia de registro y separación de Fecha de origen. Una jornada vacía o abierta mantiene sus valores correspondientes; un cierre incompleto no se completa con ceros.
4. Exportar los informes actuales: filas completas aunque no se haya recorrido el scroll, filtros aceptados, encabezados, saldos anterior/posterior, cortes y totales. Probar vacío, textos largos, varias páginas, acentos y cifras grandes. Abrir/imprimir el archivo desde el mismo visor, también en móvil.
5. Cerrar normalmente: no debe generarse documento. Cerrar y emitir: mismo teórico/contado/diferencia y PDF de la apertura recién cerrada. Comparar con la emisión desde el menú.
6. Simular fallo del informe después de confirmar el cierre: estado Cerrado conservado, aviso claro y reemisión sin otro POST. Seleccionar una nueva apertura y reemitir la anterior: el PDF debe seguir mostrando la original.
7. Cancelar filtros no altera el archivo de la consulta aceptada. Un fallo de fuente/generación permite reintentar conservando datos. Revisar descarga explícita móvil y usuarios sin permiso de informe: el cierre normal continúa disponible.

## Verificación realizada

- Build completo compartido/API/web y comprobaciones TypeScript correctos. Las bibliotecas PDF y sus fuentes se publican como recursos locales; se cargan al exportar.
- **53 pruebas unitarias** aprobadas: documento de 450 registros con cortes/saldos/totales completos, texto y formato exactos, respuestas vacías y generación de un PDF real multipágina con fuentes incrustadas.
- Suite completa aislada: **195 pruebas en MySQL y 195 en MariaDB**, sin fallos. La revisión final de la consulta acotada a apertura también pasó las 15 pruebas de Caja en ambos motores. Cubre efectivo/otros medios, varias afectaciones, anulaciones, reversos, cierres discordantes/incompletos, precisión, permisos, más de 200 movimientos y ausencia de escrituras.
- Chromium sobre el bundle publicable con API simulada: selección de apertura, exportación real de 350 movimientos sin recorrer el scroll, acentos/signos, varias páginas, total vacío, cortes del Resumen diario y saldos del mayor. Se probó un cierre fallido sin emisión, cierre normal sin PDF y cierre confirmado con fallo de emisión; seleccionar otra apertura y reemitir no volvió a cerrar ni cambió la jornada del archivo. Incluye móvil, descarga, permisos y reintento de fuentes fallidas. Se revisó visualmente el PDF y su texto completo; esta comprobación complementa las pruebas SQL, no certifica el despliegue de Hostinger ni una impresora física.
- Sin comandos ni escrituras en la base de producción. No requiere migraciones.
