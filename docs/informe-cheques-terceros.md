# Informe Cheques de terceros

Entrega incremental INF-04. Menú **Informes → Cheques de terceros**, ruta `/informe-cheques-terceros`; API de consulta `GET /api/informes/cheques/terceros`. No crea tablas, migraciones, dependencias ni operaciones financieras. Los próximos informes bancarios, Tesorería y detalle de caja permanecen en el [roadmap](entregas-y-pendientes.md).

## Alcance

Una fila por instrumento de tipo Tercero, con número, banco librador, emisión, vencimiento, cliente de la recepción, estado actual e importe nominal. Incluye En cartera, Depositado, Acreditado, Rechazado, Endosado y Devuelto. No incluye cheques propios, transferencias, cheques anulados ni recepciones anuladas. También se excluye un instrumento cuya recepción esté vinculada a un movimiento anulado. Un original revertido mantiene su trazabilidad y su instrumento se presenta con el estado real, por ejemplo Devuelto.

Las relaciones de recepción y depósito eligen un solo evento por cheque. No se unen todas sus afectaciones/eventos al agregado monetario: un cheque recibido, endosado, recuperado, depositado y acreditado continúa contando una sola vez.

Se usa ReportView sin KPI: modal inicial, sin carga hasta Aceptar, cancelar conserva lo aceptado, actualización manual, Propiedades, tabla limpia, importes argentinos a la derecha, fechas dd/MM/yyyy y scroll horizontal interno. La colección completa se presenta en bloques de 200, con un subtotal al terminar cada estado y Total general al final. Una respuesta válida vacía conserva encabezados y total cero sin mensajes de detalle.

## Filtros y orden

- Estado actual, Banco, Cliente de origen mediante SF y búsqueda general (número, librador/cuenta libradora, banco/cuenta de destino y cliente).
- Banco y Cliente son opcionales y permiten registros inactivos con historia. La búsqueda trata `%`, `_` y `!` como caracteres literales.
- Fechas por **Vencimiento** inicialmente; se puede elegir Emisión. Fecha desde = hoy menos 30 días calendario; hasta = hoy, desde la función común de filtros. Extremos inclusivos. Las fechas son modificables/limpiables.
- Para próximos vencimientos, ampliar Fecha hasta. Para toda la cartera, vaciar ambas fechas y elegir En cartera. No se impone una caja abierta o seleccionada.
- Los grupos se ordenan por descripción del estado; dentro de cada grupo, por ID ascendente inicialmente. El encabezado de otra columna ordena dentro de cada estado con desempate estable; Estado invierte el orden de los grupos. El número de cheque conserva sus 30 dígitos como texto, con comparación numérica SQL.

**Las fechas filtran el instrumento, no reconstruyen su estado histórico.** Un cheque emitido en octubre que hoy esté acreditado aparece como Acreditado aunque se consulte octubre. Esta entrega no intenta reconstruir un corte histórico.

## Totales e interpretación financiera

`totales` y `subtotales` contienen Cantidad e Importe, calculados con DECIMAL en el servidor sobre todos los registros que cumplen los filtros. Se transportan como texto monetario; el navegador solo formatea. Cada estado conserva su cantidad/subtotal y el pie presenta cantidad/importe general.

El total es **nominal de instrumentos**, no saldo disponible: sumar cheques acreditados, endosados o rechazados no significa que ese dinero esté en cartera ni en la cuenta bancaria. Para disponibilidad actual de instrumentos, filtrar En cartera; Depositado todavía no equivale a Acreditado. Banco identifica al banco librador; Cuenta de depósito en Propiedades identifica la cuenta propia de destino y puede pertenecer a otro banco.

La consulta de filas, subtotales y total usa un snapshot REPEATABLE READ / READ ONLY. El modo `continuo=1` devuelve toda la colección y el contrato paginado opcional mantiene totales de todo el filtro. No se ejecutan depósitos, acreditaciones, rechazos ni ajustes de caja/banco al consultar.

## Propiedades e historial

`GET /api/informes/cheques/terceros/:id` revalida que el cheque pertenezca al alcance del informe y carga sus datos actuales, librador, cuenta libradora, cuenta de depósito y operación de recepción formateada. Un cheque propio, inexistente o de recepción anulada no se obtiene por esta ruta.

El panel reutiliza DataTable para **Eventos vigentes**, con Propiedades de cada evento: tipo, fecha, usuario, cuenta, operación relacionada, estado de esa operación, observación y efecto bancario si existe. Se excluyen los eventos vinculados a operaciones anuladas por la regla común de Informes. Si se anuló un Pago que endosaba el cheque, el informe conserva la recepción y los eventos posteriores vigentes sin presentar ese endoso anulado como vigente. La recuperación registral completa sigue en **Valores**, con todas las correcciones y estados; el informe no borra eventos ni reemplaza esa auditoría.

Un depósito no tiene por qué tener movimiento de caja ni ingreso bancario. La acreditación muestra su cuenta e ingreso real registrado, sin sumarlo nuevamente al importe nominal del cheque. La vista de eventos no permite operar ni consultar otros módulos sin sus permisos.

## Permisos

Nuevo permiso independiente `informe-cheques-terceros`, solo Consulta. Administrador accede automáticamente. A otros usuarios se habilita desde Usuarios; el servidor rechaza configurarlo como Operar. No se habilita automáticamente a usuarios heredados ni por tener Valores.

Las referencias auxiliares de Banco/Cliente permiten preparar filtros y solo exponen los campos necesarios. No conceden acceso a sus ABM, a Valores, a caja ni a otras consultas financieras. Detalle y listado del informe aplican el mismo permiso; no se amplía el permiso del módulo operativo Valores.

## Archivos principales

- API: `reports/cheques.ts`, `routes.ts`, `store.ts`, `validation.ts`; permisos de consulta en `users/routes.ts` y referencias en `references/routes.ts`.
- Compartido: `reports.ts` (contrato), `values.ts` (catálogo de estados de terceros), `permissions.ts` (opción del menú).
- Web: `reports/ThirdPartyChequesPage.tsx`, navegación y Workspace. Reutiliza ReportView, DataTable, cortes, modal, SF, DropDown, Propiedades y formatos existentes, sin modificar su estética.
- Integración: `tests/integration/cheque-report.test.ts` y registro en `scripts/integration.mjs`.
- Documentación: esta guía, README y `docs/entregas-y-pendientes.md`, con CLI-01/CLI-02 separados de las propuestas técnicas.

## Qué probar antes de aceptar

1. Entrar al informe: modal inicial y ninguna petición de resultados hasta Aceptar. Revisar rango de 30 días y criterio Vencimiento. Probar Cancelar y Actualizar.
2. Consultar cheques recibidos en distintos estados y ampliar Hasta para próximos vencimientos. Vaciar fechas y filtrar En cartera. Cambiar a Emisión y verificar la diferencia del criterio.
3. Probar Banco/Cliente (también inactivos), búsqueda literal y rangos inválidos. No deben aparecer propios, transferencias ni recepciones anuladas.
4. Comparar el estado con Valores. Un cheque con varios eventos debe tener una sola fila y un solo importe nominal. Contrastar los subtotales por estado y el Total general con la respuesta de la API, incluso con más de 200 cheques.
5. Propiedades: cliente/recepción, banco librador versus cuenta de depósito, historial vigente y sus efectos bancarios. Con un Pago anulado seguido de depósito/acreditación, el cheque debe aparecer una vez y el endoso anulado no mostrarse como evento vigente. Valores conserva la historia completa.
6. Consultar un filtro sin resultados: encabezados y total cero. Revisar orden, scroll y Propiedades en escritorio/móvil; ningún subtotal debe seleccionarse como si fuera un cheque.
7. Habilitar solo el nuevo permiso a un usuario: puede consultar informe y referencias, pero no gana acceso a Valores, caja, maestros ni acciones financieras. Sin ese permiso no debe ver ni consultar el informe.

## Pedidos del cliente registrados, sin implementar

CLI-01: envío masivo de saldos (WhatsApp preferido; SMS/Email alternativos), pendiente de definición de saldo, destinatarios/consentimiento, API oficial, costos y evaluación de alternativas. No se agregan envíos, proveedores, credenciales ni cambios de contacto.

CLI-02: controles de Caja, parcialmente cubiertos por Resumen diario. Se propone INF-09, detalle de movimientos por caja/jornada para explicar un cierre, sin duplicar el resumen y sin implementar esa nueva consulta en esta entrega.

## Verificación realizada

- TypeScript compartido, API y web correcto; 50 pruebas unitarias aprobadas.
- Suite completa aislada: **191 pruebas en MySQL y 191 en MariaDB**, sin fallos. Las ocho del nuevo archivo verifican terceros y exclusiones, circuito real de endoso/anulación/recuperación/depósito/acreditación/rechazo/devolución, filtros y orden, una incidencia por instrumento, agregados completos, precisión DECIMAL, referencias/permisos y ausencia de escrituras.
- Chromium con API simulada: modal sin autocarga, rango común, Banco histórico y SF, filtros/validación, 250 cheques con cortes y totales completos, Propiedades y eventos, total vacío, consulta móvil sin desborde y permiso independiente. Complementa las pruebas con SQL real; no sustituye la aceptación del despliegue.
- No se ejecutó build de producción ni se accedió a Hostinger o a su base de datos.
