# Etapa 8 — Valores: primera entrega de consulta

Centraliza la consulta de cheques propios, cheques de terceros y transferencias ya registrados desde Cobros y pagos. No crea instrumentos, no cambia sus estados ni incorpora depósitos, acreditaciones, rechazos o débitos de cheques. No requiere caja abierta, nuevas tablas, migraciones, variables o dependencias.

## Listado

- `/valores` comienza vacío. Solo Aplicar filtros o Actualizar consulta registros. Volver al módulo restablece este comportamiento; regresar de Consultar al listado conserva datos, filtros, página y orden sin recargar.
- Un cheque tiene una sola fila aunque haya sido recibido, endosado o corregido varias veces. Las transferencias tienen su propia fila y tabla. La clave combina familia e IDTabla: un cheque y una transferencia con el mismo identificador interno no se confunden. Los IDs no se presentan como datos funcionales.
- Columnas: tipo, número/referencia, fecha de emisión/operación, vencimiento, banco, cuenta propia, importe, estado actual y cliente de origen. Los nombres relacionados se consultan desde sus maestros, incluso si luego se desactivaron; no se duplican descripciones en las operaciones.
- Filtros: búsqueda general, tipo, estado, banco, cuenta propia y rango de fechas. Fecha desde/hasta se sugieren con el día actual del negocio y se pueden limpiar. Estado comienza en Todos porque los instrumentos tienen estados distintos: Cartera, Emitido, Endosado, etc.; Confirmado no representa a todos los valores.
- Fecha a consultar puede ser Emisión/operación o Vencimiento (cheques). El segundo criterio excluye transferencias porque no tienen vencimiento. No se mezclan fechas de registro con fechas comerciales.
- La búsqueda encuentra número/referencia, banco, cuenta propia, cliente (código/nombre), librador, descripción y número formateado del comprobante de origen. `%`, `_` y `!` se tratan como texto literal. Se parametrizan los valores y se permiten únicamente columnas de orden conocidas.
- La paginación y el orden se aplican en el servidor sobre todo el resultado filtrado. Las fechas e importes conservan sus tipos SQL; los números de cheque se ordenan numéricamente sin convertirlos a Number. El orden inicial combina registro ascendente, ID interno y familia para ser estable entre tablas.

## Consulta y Propiedades

Toolbar estándar: Consultar (ojo), Propiedades, Filtrar y Actualizar. No hay Agregar/Modificar/Eliminar. Doble clic abre la misma consulta que el ojo. Propiedades permanece deshabilitado sin fila seleccionada y abre el OffCanvas pequeño existente.

Consultar valor usa FormSections: Datos generales, Historial y Operaciones relacionadas. Mantiene navegación lateral, scroll, sticky y presentación responsive. Los datos son de solo lectura.

- Cheques: banco/cuenta, cuenta libradora, librador, documento, fechas, importe, estado actual y origen. Su historial utiliza CHEQUEEVENTO con evento, fecha comercial, usuario, cuenta, observaciones y movimiento relacionado. No convierte anulación/reversión de una operación en un estado nuevo inventado del instrumento.
- Transferencias: referencia, cuenta, fecha, importe y origen. Su estado operativo deriva del movimiento: una anulación registral se muestra Anulado; un original con reverso confirmado se muestra Revertido; la contrapartida sigue Confirmado. Su historial de consulta se arma con el registro de TRANSFERENCIA, los datos persistidos de anulación y la relación real CajaMovimientoOrigen. No se agrega otra tabla de eventos ni se ejecuta una transferencia bancaria.
- Operaciones relacionadas incluye las participaciones del cheque y sus vínculos de reversión, o el origen/contrapartida de la transferencia. Consultar abre CashProperties existente, con comprobante, número, estado, valores y enlaces; no navega a un alta ni habilita acciones financieras.
- Las listas internas reutilizan DataTable, con selección, orden local sobre su colección completa y Propiedades. Los importes usan la función monetaria existente y todas las fechas se presentan como dd/MM/yyyy; los instantes de registro muestran también la hora de Buenos Aires.

## Backend y seguridad

Rutas autenticadas `GET /api/valores` y `GET /api/valores/:family/:id`, con familia CHEQUE o TRANSFERENCIA e identificador BIGINT válido. Los usuarios de consulta y ADMIN acceden al mismo contenido; no se pide CSRF porque no hay escrituras. POST/PUT/PATCH/DELETE no están implementados y responden 405; sin sesión, 401.

El repositorio ejecuta las lecturas dentro de transacciones READ ONLY con snapshot coherente para datos/conteo y detalle/eventos/operaciones. No cambia CHEQUE, CHEQUEEVENTO, TRANSFERENCIA, BANCOMOVIMIENTO, saldos, aplicaciones, numeración, auditoría o cierres. No ofrece saldos bancarios disponibles: su definición y el saldo inicial bancario siguen pendientes.

## Publicación y prueba

Desplegar el código con la compilación habitual. No hay una migración nueva para esta entrega; se conservan las 21 tablas y las migraciones anteriores deben estar aplicadas.

1. Ingresar a Valores con instrumentos ya registrados: el listado debe comenzar vacío. Actualizar o aplicar filtros debe mostrar los del rango elegido. Limpiar fechas para consultar instrumentos anteriores.
2. Probar cheques propios/terceros y transferencias, estados, banco/cuenta, emisión/vencimiento, búsqueda, orden descendente/ascendente/restablecer y paginación.
3. Seleccionar una fila y abrir Propiedades; doble clic/Consultar debe mostrar las tres secciones. Los identificadores internos no deben aparecer como campos.
4. Consultar un cheque recibido y luego endosado: una fila en la lista, ambos eventos y sus operaciones. Desde el evento u operación, abrir su consulta y volver sin perder la selección del valor.
5. Consultar una transferencia anulada y una revertida: verificar la diferencia entre anulación y original/contrapartida. Comparar con Cobros y pagos sin modificar registros.
6. Probar usuario de consulta, ausencia de caja abierta, pantalla móvil, scroll horizontal de tablas, error de red/reintento y sesión vencida.

Las pruebas de integración usan MySQL/MariaDB aislados y movimientos financieros reales de prueba. Cubren filtros, precisión, fechas, estado/historial, IDs coincidentes entre tablas, orden global/paginación, permisos y comparación de tablas antes/después para detectar cualquier escritura. La revisión con navegador y API simulada verifica la navegación y los componentes; no reemplaza la prueba del despliegue.

## Próximas entregas

Definir antes de implementar el circuito de terceros (depósito, acreditación, devolución/rechazo) y luego el de propios (débito y correcciones). Traspasos de fondos, aplicación posterior de anticipos, saldo inicial/disponibilidad bancaria y conciliación continúan separados. Esta consulta reutiliza los instrumentos existentes y no adelanta decisiones de esos circuitos.
