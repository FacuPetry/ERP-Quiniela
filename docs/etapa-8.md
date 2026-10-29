# Etapa 8 — Valores: consulta y depósito de cheques de terceros

Centraliza la consulta de cheques propios, cheques de terceros y transferencias ya registrados desde Cobros y pagos. La segunda entrega agrega el depósito de cheques de terceros en cartera; no incorpora todavía acreditaciones, rechazos o débitos de cheques propios. No requiere caja abierta, nuevas tablas, migraciones, variables o dependencias.

## Listado

- `/valores` comienza vacío. Solo Aplicar filtros o Actualizar consulta registros. Volver al módulo restablece este comportamiento; regresar de Consultar al listado conserva datos, filtros, página y orden sin recargar.
- Un cheque tiene una sola fila aunque haya sido recibido, endosado o corregido varias veces. Las transferencias tienen su propia fila y tabla. La clave combina familia e IDTabla: un cheque y una transferencia con el mismo identificador interno no se confunden. Los IDs no se presentan como datos funcionales.
- Columnas: tipo, número/referencia, fecha de emisión/operación, vencimiento, banco, cuenta propia, importe, estado actual y cliente de origen. Los nombres relacionados se consultan desde sus maestros, incluso si luego se desactivaron; no se duplican descripciones en las operaciones.
- Filtros: búsqueda general, tipo, estado, banco, cuenta propia y rango de fechas. Fecha desde/hasta se sugieren con el día actual del negocio y se pueden limpiar. Estado comienza en Todos porque los instrumentos tienen estados distintos: Cartera, Emitido, Endosado, etc.; Confirmado no representa a todos los valores.
- Fecha a consultar puede ser Emisión/operación o Vencimiento (cheques). El segundo criterio excluye transferencias porque no tienen vencimiento. No se mezclan fechas de registro con fechas comerciales.
- La búsqueda encuentra número/referencia, banco, cuenta propia, cliente (código/nombre), librador, descripción y número formateado del comprobante de origen. `%`, `_` y `!` se tratan como texto literal. Se parametrizan los valores y se permiten únicamente columnas de orden conocidas.
- La paginación y el orden se aplican en el servidor sobre todo el resultado filtrado. Las fechas e importes conservan sus tipos SQL; los números de cheque se ordenan numéricamente sin convertirlos a Number. El orden inicial combina registro ascendente, ID interno y familia para ser estable entre tablas.

## Consulta y Propiedades

Toolbar estándar: Consultar (ojo), Propiedades, Filtrar y Actualizar. No hay Agregar/Modificar/Eliminar. ADMIN dispone además de Depositar cheques, una acción específica que abre el OffCanvas grande. Doble clic abre la misma consulta que el ojo. Propiedades permanece deshabilitado sin fila seleccionada y abre el OffCanvas pequeño existente.

Consultar valor usa FormSections: Datos generales, Historial y Operaciones relacionadas. Mantiene navegación lateral, scroll, sticky y presentación responsive. Los datos son de solo lectura.

- Cheques: banco/cuenta, cuenta libradora, librador, documento, fechas, importe, estado actual y origen. Su historial utiliza CHEQUEEVENTO con evento, fecha comercial, usuario, cuenta, observaciones y movimiento relacionado. No convierte anulación/reversión de una operación en un estado nuevo inventado del instrumento.
- Transferencias: referencia, cuenta, fecha, importe y origen. Su estado operativo deriva del movimiento: una anulación registral se muestra Anulado; un original con reverso confirmado se muestra Revertido; la contrapartida sigue Confirmado. Su historial de consulta se arma con el registro de TRANSFERENCIA, los datos persistidos de anulación y la relación real CajaMovimientoOrigen. No se agrega otra tabla de eventos ni se ejecuta una transferencia bancaria.
- Operaciones relacionadas incluye las participaciones del cheque y sus vínculos de reversión, o el origen/contrapartida de la transferencia. Consultar abre CashProperties existente, con comprobante, número, estado, valores y enlaces; no navega a un alta ni habilita acciones financieras.
- Las listas internas reutilizan DataTable, con selección, orden local sobre su colección completa y Propiedades. Los importes usan la función monetaria existente y todas las fechas se presentan como dd/MM/yyyy; los instantes de registro muestran también la hora de Buenos Aires.

## Backend y seguridad

Rutas autenticadas `GET /api/valores` y `GET /api/valores/:family/:id`, con familia CHEQUE o TRANSFERENCIA e identificador BIGINT válido. Los usuarios de consulta y ADMIN acceden al mismo contenido de lectura, sin CSRF. `POST /api/valores/depositos` requiere ADMIN, petición de aplicación, CSRF y una clave UUID de idempotencia. Las otras escrituras no están implementadas y responden 405; sin sesión, 401.

El repositorio ejecuta las lecturas dentro de transacciones READ ONLY con snapshot coherente para datos/conteo y detalle/eventos/operaciones. Las consultas no cambian CHEQUE, CHEQUEEVENTO, TRANSFERENCIA, BANCOMOVIMIENTO, saldos, aplicaciones, numeración, auditoría o cierres. No ofrece saldos bancarios disponibles: su definición y el saldo inicial bancario siguen pendientes.

## Publicación y prueba

Desplegar el código con la compilación habitual. No hay una migración nueva para esta entrega; se conservan las 21 tablas y las migraciones anteriores deben estar aplicadas.

1. Ingresar a Valores con instrumentos ya registrados: el listado debe comenzar vacío. Actualizar o aplicar filtros debe mostrar los del rango elegido. Limpiar fechas para consultar instrumentos anteriores.
2. Probar cheques propios/terceros y transferencias, estados, banco/cuenta, emisión/vencimiento, búsqueda, orden descendente/ascendente/restablecer y paginación.
3. Seleccionar una fila y abrir Propiedades; doble clic/Consultar debe mostrar las tres secciones. Los identificadores internos no deben aparecer como campos.
4. Consultar un cheque recibido y luego endosado: una fila en la lista, ambos eventos y sus operaciones. Desde el evento u operación, abrir su consulta y volver sin perder la selección del valor.
5. Consultar una transferencia anulada y una revertida: verificar la diferencia entre anulación y original/contrapartida. Comparar con Cobros y pagos sin modificar registros.
6. Probar usuario de consulta, ausencia de caja abierta, pantalla móvil, scroll horizontal de tablas, error de red/reintento y sesión vencida.

Las pruebas de integración usan MySQL/MariaDB aislados y movimientos financieros reales de prueba. Cubren filtros, precisión, fechas, estado/historial, IDs coincidentes entre tablas, orden global/paginación, permisos y comparación de tablas antes/después para detectar cualquier escritura. La revisión con navegador y API simulada verifica la navegación y los componentes; no reemplaza la prueba del despliegue.

## Depósito de cheques de terceros

- Desde Valores, ADMIN abre **Depositar cheques**. El OffCanvas grande reutiliza DataTable con selección múltiple, Propiedades, búsqueda, actualización, orden remoto y paginación. La selección persiste entre páginas y búsquedas; Limpiar selección la vacía. El listado empieza vacío y se consulta al presionar Buscar o Actualizar. No hereda el filtro de hoy del listado principal: muestra todos los cheques de terceros en cartera cuando se solicita.
- Se eligen cuenta bancaria propia activa y fecha (hoy sugerido), con observaciones opcionales. También debe estar activo el banco de la cuenta. La selección admite hasta 100 cheques completos por depósito; no divide instrumentos ni permite modificar su importe.
- Al confirmar se revalidan todos los cheques, bloqueados por ID ascendente. Deben seguir siendo de terceros y estar en CARTERA. La fecha no puede anteceder a la emisión ni a ningún evento comercial anterior; el vencimiento se conserva y se muestra, sin confundirlo con acreditación efectiva.
- Una transacción registra un evento DEPOSITO por cheque, su cuenta de destino, fecha, usuario, instante y observación; actualiza el estado a DEPOSITADO y registra auditoría e idempotencia. Si falla un cheque o la auditoría, no se confirma ninguna parte del lote. Los reintentos idénticos, incluso simultáneos, devuelven el mismo resultado. Otra solicitud que intenta depositar o endosar el mismo cheque debe revalidar su estado bajo el mismo bloqueo de CHEQUE.
- La cuenta de destino vive en CHEQUEEVENTO.BancoCuenta. No se cambia CHEQUE.Banco ni CHEQUE.BancoCuenta: se conserva la identidad del instrumento y de la cuenta libradora. La consulta obtiene la cuenta propia del último depósito para cheques de terceros sin cuenta propia, incluyendo filtros y Propiedades; el banco visible del instrumento sigue siendo su banco librador. El evento conserva su cuenta aunque ese maestro luego se desactive.
- El depósito **no acredita fondos**: no inserta BANCOMOVIMIENTO, TRANSFERENCIA, CAJAMOVIMIENTO ni CUENTACORRIENTE, no modifica afectaciones, numeradores, efectivo ni cierres y no requiere caja abierta o comprobante adicional. La futura acreditación será otro evento con su efecto bancario, sin duplicarlo.
- Los cheques depositados salen de la cartera disponible para pagos. Las restricciones existentes impiden anular/revertir su cobro original mientras tengan eventos posteriores. Esta entrega no ofrece deshacer depósitos, devolver cheques ni reabrir deudas; esos circuitos deben definirse antes de habilitarlos.
- Al guardar se actualiza el listado principal solamente si ya había sido consultado. La consulta detallada sigue siendo de solo lectura, y su historial muestra Depósito, fecha, cuenta de destino, usuario y observación.

### Prueba del depósito

1. Registrar desde Cobros y pagos al menos dos cheques nuevos de terceros. Tener una cuenta bancaria propia y su banco activos. No es necesario mantener una caja abierta para el depósito.
2. Entrar a Valores como ADMIN, abrir Depositar cheques: la grilla empieza vacía. Actualizar o Buscar carga solo terceros en cartera. Seleccionar varios, probar Propiedades, orden, paginación y Limpiar selección.
3. Elegir cuenta, fecha y observación; comprobar el total y confirmar. Debe indicar depósito registrado y pendiente de acreditación.
4. Consultar esos instrumentos en Valores, limpiando las fechas del filtro si fueron emitidos otro día. Filtrar Estado Depositado y la cuenta de destino. Revisar el evento en Historial, con sus datos, y la operación original conservada.
5. Verificar que ya no se ofrecen en cartera al registrar un pago. No debe cambiar el efectivo ni los pendientes de Cuenta corriente; tampoco debe generarse un crédito bancario por el depósito.
6. Abrir el selector en dos pestañas y tratar de depositar el mismo cheque: una sola solicitud nueva podrá confirmarlo. Un usuario de consulta no debe ver la acción ni poder ejecutarla.
7. Probar cuentas/bancos desactivados, fechas anteriores a la recepción, cancelar sin guardar y visualización móvil. Ante un error de red, reintentar los mismos datos conserva la clave de solicitud.

La integración en MySQL y MariaDB verifica permisos/CSRF, contratos, cuentas y fechas, registro por lote, exclusión de cartera, historial, ausencia de efectos financieros, reintentos/concurrencia, competencia con endoso y rollback completo ante fallo de auditoría. Se conserva la suite previa de consultas sin escrituras.

## Próximas entregas

Definir e implementar acreditación y devolución/rechazo de terceros, incluyendo cómo recuperar la deuda del cliente cuando corresponda; después, débito y correcciones de cheques propios. Traspasos de fondos, aplicación posterior de anticipos, saldo inicial/disponibilidad bancaria y conciliación continúan separados.
