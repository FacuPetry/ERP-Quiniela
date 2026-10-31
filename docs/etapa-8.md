# Etapa 8 — Valores: consulta, depósito, acreditación y rechazo de terceros

Centraliza la consulta de cheques propios, cheques de terceros y transferencias ya registrados desde Cobros y pagos. Permite depositar cheques de terceros en cartera y confirmar su acreditación bancaria. Incluye el rechazo de terceros depositados o acreditados, con deuda vinculada al evento y contrapartida bancaria cuando corresponda. No incorpora aún el rechazo de endosados, devoluciones posteriores o débitos de cheques propios. No requiere caja abierta, nuevas tablas, variables o dependencias; el rechazo requiere la migración 0008.

## Listado

- `/valores` comienza vacío. Solo Aplicar filtros o Actualizar consulta registros. Volver al módulo restablece este comportamiento; regresar de Consultar al listado conserva datos, filtros, página y orden sin recargar.
- Un cheque tiene una sola fila aunque haya sido recibido, endosado o corregido varias veces. Las transferencias tienen su propia fila y tabla. La clave combina familia e IDTabla: un cheque y una transferencia con el mismo identificador interno no se confunden. Los IDs no se presentan como datos funcionales.
- Columnas: tipo, número/referencia, fecha de emisión/operación, vencimiento, banco, cuenta propia, importe, estado actual y cliente de origen. Los nombres relacionados se consultan desde sus maestros, incluso si luego se desactivaron; no se duplican descripciones en las operaciones.
- Filtros: búsqueda general, tipo, estado, banco, cuenta propia y rango de fechas. Fecha desde/hasta se sugieren con el día actual del negocio y se pueden limpiar. Estado comienza en Todos porque los instrumentos tienen estados distintos: Cartera, Emitido, Endosado, etc.; Confirmado no representa a todos los valores.
- Fecha a consultar puede ser Emisión/operación o Vencimiento (cheques). El segundo criterio excluye transferencias porque no tienen vencimiento. No se mezclan fechas de registro con fechas comerciales.
- La búsqueda encuentra número/referencia, banco, cuenta propia, cliente (código/nombre), librador, descripción y número formateado del comprobante de origen. `%`, `_` y `!` se tratan como texto literal. Se parametrizan los valores y se permiten únicamente columnas de orden conocidas.
- La paginación y el orden se aplican en el servidor sobre todo el resultado filtrado. Las fechas e importes conservan sus tipos SQL; los números de cheque se ordenan numéricamente sin convertirlos a Number. El orden inicial combina registro ascendente, ID interno y familia para ser estable entre tablas.

## Consulta y Propiedades

Toolbar estándar: Consultar (ojo), Propiedades, Filtrar y Actualizar. No hay Agregar/Modificar/Eliminar. ADMIN dispone además de Depositar cheques y Acreditar cheques; ambas acciones utilizan el mismo panel configurable dentro del OffCanvas grande. Rechazar cheque se habilita para una fila de terceros depositada o acreditada y abre un OffCanvas mediano con los controles base. Doble clic abre la misma consulta que el ojo. Propiedades permanece deshabilitado sin fila seleccionada y abre el OffCanvas pequeño existente.

Consultar valor usa FormSections: Datos generales, Historial y Operaciones relacionadas. Mantiene navegación lateral, scroll, sticky y presentación responsive. Los datos son de solo lectura.

- Cheques: banco/cuenta, cuenta libradora, librador, documento, fechas, importe, estado actual y origen. Su historial utiliza CHEQUEEVENTO con evento, fecha comercial, usuario, cuenta, observaciones y movimiento relacionado. No convierte anulación/reversión de una operación en un estado nuevo inventado del instrumento.
- Transferencias: referencia, cuenta, fecha, importe y origen. Su estado operativo deriva del movimiento: una anulación registral se muestra Anulado; un original con reverso confirmado se muestra Revertido; la contrapartida sigue Confirmado. Su historial de consulta se arma con el registro de TRANSFERENCIA, los datos persistidos de anulación y la relación real CajaMovimientoOrigen. No se agrega otra tabla de eventos ni se ejecuta una transferencia bancaria.
- Operaciones relacionadas incluye las participaciones del cheque y sus vínculos de reversión, o el origen/contrapartida de la transferencia. Consultar abre CashProperties existente, con comprobante, número, estado, valores y enlaces; no navega a un alta ni habilita acciones financieras.
- Las listas internas reutilizan DataTable, con selección, orden local sobre su colección completa y Propiedades. Los importes usan la función monetaria existente y todas las fechas se presentan como dd/MM/yyyy; los instantes de registro muestran también la hora de Buenos Aires.

## Backend y seguridad

Rutas autenticadas `GET /api/valores` y `GET /api/valores/:family/:id`, con familia CHEQUE o TRANSFERENCIA e identificador BIGINT válido. Los usuarios de consulta y ADMIN acceden al mismo contenido de lectura, sin CSRF. `POST /api/valores/depositos` y `POST /api/valores/acreditaciones` requieren ADMIN, petición de aplicación, CSRF y una clave UUID de idempotencia. `GET /api/valores/CHEQUE/:id/rechazo` consulta la vista previa con sesión; `POST /api/valores/CHEQUE/:id/rechazar` requiere ADMIN, CSRF, idempotencia y versión If-Match. Las otras escrituras no están implementadas y responden 405; sin sesión, 401.

El repositorio ejecuta las lecturas dentro de transacciones READ ONLY con snapshot coherente para datos/conteo y detalle/eventos/operaciones. Las consultas no cambian CHEQUE, CHEQUEEVENTO, TRANSFERENCIA, BANCOMOVIMIENTO, saldos, aplicaciones, numeración, auditoría o cierres. No ofrece saldos bancarios disponibles: su definición y el saldo inicial bancario siguen pendientes.

## Publicación y prueba

Desplegar el código con la compilación habitual. Para el rechazo aplicar la migración **0008_rechazo_cheques** antes de habilitar el nuevo código; se conservan las 21 tablas. Ver el procedimiento específico más abajo.

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
- La cuenta de destino vive en CHEQUEEVENTO.BancoCuenta. No se cambia CHEQUE.Banco ni CHEQUE.BancoCuenta: se conserva la identidad del instrumento y de la cuenta libradora. La consulta obtiene prioritariamente la cuenta propia del último depósito, incluyendo filtros y Propiedades; el banco visible del instrumento sigue siendo su banco librador. El evento conserva su cuenta aunque ese maestro luego se desactive.
- El depósito **no acredita fondos**: no inserta BANCOMOVIMIENTO, TRANSFERENCIA, CAJAMOVIMIENTO ni CUENTACORRIENTE, no modifica afectaciones, numeradores, efectivo ni cierres y no requiere caja abierta o comprobante adicional. La acreditación es otro evento con su efecto bancario, sin duplicarlo.
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

## Acreditación de cheques de terceros

- ADMIN abre **Acreditar cheques** desde Valores. Reutiliza el panel configurable ChequeOperation, el OffCanvas grande y DataTable con selección múltiple, búsqueda, orden remoto, paginación y Propiedades. El listado empieza vacío y consulta únicamente terceros con estado DEPOSITADO al Buscar/Actualizar; no hereda el rango de emisión del listado principal.
- Se seleccionan hasta 100 cheques completos y la fecha real de acreditación, hoy sugerido; observaciones son opcionales. La cuenta de destino aparece en cada fila y no se puede elegir ni cambiar. Puede haber cheques depositados en diferentes cuentas dentro del mismo lote: cada uno genera su propio ingreso en la cuenta de su depósito.
- Confirmar significa registrar una acreditación **efectivamente realizada por el banco**, por el importe completo del instrumento. No ejecuta operaciones contra el banco, no acredita automáticamente al vencer ni descuenta comisiones. La fecha no puede anteceder al depósito o a los eventos comerciales anteriores. El vencimiento continúa siendo una fecha del instrumento, no una confirmación bancaria automática.
- Bajo los bloqueos compartidos de CHEQUE se revalida que todos sigan DEPOSITADO, que su último evento sea DEPOSITO con cuenta propia y que el instrumento no tenga ya un movimiento bancario. La cuenta y su banco deben seguir activos; si se desactivaron, revisar/reactivar esa configuración antes de confirmar. El servidor obtiene cuenta e importe del registro persistido y rechaza cuenta, importe, estado o caja enviados por el cliente.
- Una sola transacción crea por cheque el evento ACREDITACION y estado ACREDITADO, un BANCOMOVIMIENTO de INGRESO por su importe (Origen CHEQUE, FK ChequeEvento), la auditoría y la respuesta idempotente. No modifica CHEQUE.Banco/BancoCuenta, fechas, importe o identidad, ni el evento de depósito. Filtros y Propiedades muestran la cuenta de depósito incluso si hay otra referencia histórica en CHEQUE.BancoCuenta.
- El bloqueo de estado evita duplicaciones entre solicitudes simultáneas; la clave de reintento devuelve la respuesta ya confirmada sin agregar otro ingreso. Si falla una validación o la auditoría, se revierten estado, eventos, asientos bancarios y solicitud de todo el lote. La huella canónica de los depósitos existentes conserva su orden anterior para admitir sus reintentos después de actualizar el código.
- No requiere caja abierta ni comprobante/numerador adicional. No crea ni modifica CAJAMOVIMIENTO, CAJASALDO, CUENTACORRIENTE, TRANSFERENCIA o afectaciones. El cobro original ya tuvo su efecto comercial y no se vuelve a descontar al acreditar. No altera cierres ni ofrece saldos bancarios disponibles: aún falta definir saldo inicial, disponibilidad y conciliación.
- Valores incorpora el estado Acreditado. El historial muestra Acreditación, fecha, cuenta, usuario y observación. Propiedades del evento permite ver el sentido e importe bancarios. La operación de origen y la historia de recepción/depósito se mantienen. Las correcciones de un cobro con eventos posteriores continúan bloqueadas; la acreditación no permite anularse desde esta pantalla. El rechazo real utiliza una acción separada, con su contrapartida y deuda nuevas.
- No agrega tablas, columnas, migraciones, dependencias o variables. Se reutilizan las 21 tablas actuales.

### Prueba de la acreditación

1. Registrar y depositar cheques de terceros según la guía anterior; tener activos la cuenta de destino y su banco. Se puede cerrar la caja antes de acreditar.
2. Entrar como ADMIN a Valores → Acreditar cheques. Actualizar/Buscar debe mostrar únicamente terceros depositados, con sus cuentas. Verificar Propiedades y selección entre páginas; no debe ofrecer cuenta o importe editables.
3. Seleccionar cheques, ingresar fecha igual o posterior al depósito y observaciones; confirmar. Comprobar el mensaje, total y estado Acreditado, limpiando las fechas del filtro principal si los cheques fueron emitidos otro día.
4. Consultar Historial → Acreditación → Propiedades: revisar fecha, usuario, cuenta, sentido Ingreso e importe bancario. El cobro, su Cuenta corriente, efectivo y afectaciones no deben cambiar. El cheque continúa fuera de cartera.
5. Desde dos pestañas intentar acreditar los mismos cheques. Solo una solicitud nueva podrá confirmarse. Reintentar una petición idéntica conserva la misma clave y no duplica el ingreso.
6. Probar Cancelar, fecha anterior, banco/cuenta inactivos, móvil y usuario de consulta. Ningún error debe dejar un lote parcialmente acreditado. Para verificar el asiento SQL en una base de pruebas, relacionar BANCOMOVIMIENTO.ChequeEvento con CHEQUEEVENTO.IDTabla y filtrar Tipo=ACREDITACION; habrá una entrada por cheque.

La integración con MySQL y MariaDB cubre el circuito real recepción→depósito→acreditación, exactitud decimal, permisos, contratos sin destino/importe editables, fechas, cuentas activas, historial/filtros, ausencia de efectos en Caja/Cuenta corriente, prevención de duplicados, reintentos concurrentes, destinos distintos y rollback bancario ante fallo de auditoría. Se conservan las pruebas de consulta y depósito anteriores. La revisión Chromium con API simulada complementa esas pruebas, incluyendo el panel compartido, reintentos, propiedades y ancho móvil.

## Rechazo de cheques depositados o acreditados

- ADMIN selecciona un tercero DEPOSITADO o ACREDITADO en Valores y presiona **Rechazar cheque**. La operación es individual para identificar claramente cheque, cliente, comprobante y número de la deuda. CARTERA, ENDOSADO, propios y transferencias quedan fuera de este alcance.
- Comprobante se elige entre los activos de **Cuenta corriente / Cobrar / Deuda / No aplica**, por ejemplo `RCH` — Rechazo de cheque. No debe configurarse como comprobante de reversión. Se utiliza el mismo servicio de numeración y componente de dos inputs: sugerencia editable con Numerador, carga manual sin Numerador; un numerador asociado a caja se comporta como en Cuenta corriente, sin exigir una caja seleccionada. Configurar el maestro no genera operaciones.
- Cliente, número del cheque, importe y cuenta de destino se obtienen de las relaciones persistidas y son de solo lectura. La deuda se asigna al cliente que entregó el cheque en el Recibo original, conservando su cuenta histórica de Cobrar; no se selecciona otro cliente. La operación admite corregir un instrumento recibido de un cliente luego desactivado, conservando su relación histórica.
- Fecha de rechazo y Motivo son obligatorios. La fecha no puede ser anterior a la emisión ni al último evento. El nuevo vencimiento de la deuda se establece en la fecha del rechazo. No hay modificación de importes ni rechazos parciales.
- **Depositado:** se registra RECHAZO/RECHAZADO y una nueva deuda por el importe completo del cheque. No se genera movimiento bancario porque nunca se acreditó.
- **Acreditado:** además exige confirmar explícitamente que el banco ya debitó realmente el importe completo e indicar la fecha efectiva del débito. Se conserva el ingreso de la acreditación y se agrega un EGRESO en esa misma cuenta, vinculado al evento RECHAZO. La fecha bancaria puede diferir de la del rechazo pero no anteceder a la acreditación. No se ejecuta una orden bancaria ni se descuenta efectivo; comisiones y rechazos sin débito confirmado quedan fuera de esta entrega.
- Cuenta y banco deben estar activos al registrar la operación. Se validan estado, último evento, existencia/coherencia del ingreso bancario previo, cobro/crédito original vigentes y ausencia de reversión. Si hay una inconsistencia se rechaza el registro y se conserva todo el historial.
- El Recibo y las afectaciones anteriores permanecen. Ejemplo: deuda de 100.000 cancelada con efectivo 40.000 + cheque 60.000; rechazar ese cheque crea una nueva deuda de 60.000, sin reabrir además la deuda original ni revertir el efectivo.
- Si el Recibo conserva un importe a cuenta disponible, se compensa automáticamente hasta el menor entre ese remanente y el cheque. Se agrega una afectación nueva desde el Recibo a la deuda del rechazo, con usuario e instante actuales; las anteriores no se editan. Ejemplo: cobro con cheque 100.000, deuda cancelada 80.000 y anticipo 20.000: el rechazo crea deuda bruta 100.000, compensa 20.000 y deja pendiente 80.000. Importes originales del Recibo permanecen; su disponible baja por la nueva aplicación. Dos rechazos del mismo Recibo comparten y bloquean ese remanente para no consumirlo dos veces.
- La deuda aparece en Cuenta corriente y se ofrece como pendiente para un nuevo Cobro. Se identifica como Rechazo de cheque en Propiedades; no se puede anular desde la acción de movimientos manuales, porque depende del evento financiero. No se incorpora una corrección de rechazos en esta entrega.
- El evento de rechazo enlaza la deuda; Historial → Consultar operación relacionada/Propiedades permite abrir su consulta, ver comprobante/número, importe bruto y compensación. Para acreditados muestra también el egreso y su fecha bancaria, que puede diferir de la fecha del rechazo. El cheque queda RECHAZADO y no vuelve automáticamente a cartera ni se vuelve a depositar/acreditar.
- La transacción bloquea comprobante/numerador, Recibo, crédito original y cheque; luego revalida una versión de los datos y del remanente a cuenta. Numeración, evento, banco, deuda, compensación, auditoría y clave de reintento se confirman juntos. Un error o solicitud concurrente no debe dejar efectos parciales ni consumir otro número. No altera movimientos/saldos físicos de cajas abiertas o cerradas; se puede rechazar sin caja abierta.

### Migración y publicación

`0008_rechazo_cheques.sql` agrega únicamente `CUENTACORRIENTE.ChequeEvento`, nullable, con FK a CHEQUEEVENTO y unicidad por evento. Las filas existentes quedan con NULL; no se crean tablas ni se cambian importes, números, estados o relaciones anteriores. Las tres definiciones se aplican en un único ALTER TABLE. No hay cuentas/comprobantes/operaciones de ejemplo precargados.

Publicar en una ventana de mantenimiento, con la aplicación detenida mientras se actualiza el esquema. Desde la raíz de la versión desplegada (volver a ingresar al directorio `hbuilds/current/nodejs` después del despliegue), con las variables de conexión disponibles:

```sh
npm run db:migrate:prod
npm run db:check:prod
```

Reiniciar/habilitar la aplicación después de aplicar la migración. db:check mantiene 21/21 y comprueba la columna nueva. Si una ejecución interrumpida no registró la migración, revisar esquema/historial antes de reintentar; no eliminar columnas para forzar el proceso. La integración comprueba conservación de datos previos, FKs, unicidad y repetición de migraciones ya registradas.

### Prueba del rechazo

1. Crear un comprobante `RCH` con Cuenta corriente / Cobrar / Deuda / No aplica; opcionalmente asociar un Numerador. Preparar una deuda y un Recibo mixto con efectivo y cheque de terceros, y depositarlo.
2. Valores → Actualizar/Filtrar → seleccionar el cheque depositado → Rechazar cheque. Elegir RCH, comprobar número, cliente e importe; ingresar fecha/motivo y confirmar. No debe pedir débito bancario ni caja abierta.
3. Revisar RECHAZADO y el Historial completo. Consultar la deuda enlazada y su disponibilidad en Afectar de un nuevo Cobro. Verificar que el Recibo siga confirmado y que efectivo/cierres y las afectaciones anteriores permanezcan iguales.
4. Repetir con un cheque acreditado: sin confirmar débito real no debe permitir guardar. Al confirmarlo se agrega un egreso por el mismo importe en la cuenta de acreditación, conservando el ingreso anterior. Verificar fechas, motivo y vínculo a la deuda desde Propiedades.
5. Probar un cheque cuyo Recibo tiene anticipo disponible; comparar importe bruto, compensado y pendiente. Probar dos cheques del mismo Recibo y actualización de datos si cambia el remanente.
6. Probar sin Numerador con número manual, motivo vacío, fecha anterior, comprobante incompatible, usuario de consulta, estado Endosado, reintentos y dos pestañas. No deben duplicarse deuda, evento, movimiento bancario o numeración. Probar móvil y cancelar sin guardar.

La integración financiera verifica cobro mixto, débito confirmado, compensación total/parcial de anticipos, solicitudes simultáneas con claves iguales/diferentes, versión obsoleta, rollback incluso del asiento bancario y de la aplicación ante fallo tardío, numeración manual/automática, permisos, relaciones y bloqueo de anulación manual de la deuda generada. También incluye endoso→anulación→recuperación→depósito→rechazo manteniendo la historia.

## Próximas entregas

Rechazo de cheques endosados y su relación con el destinatario del Pago; corrección de rechazos y eventual devolución/reingreso del instrumento; débito y correcciones de cheques propios. Traspasos, aplicación posterior de anticipos, saldo inicial/disponibilidad bancaria, conciliación e informes siguen separados.
