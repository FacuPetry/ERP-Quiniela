# Entregas incrementales y mejoras pendientes

Revisión: **04/11/2026**. Base funcional revisada: implementación integrada hasta el PR #27 (rechazo de cheques de terceros). La entrega posterior incorpora [Usuarios, permisos e informe actual de Cuenta corriente](usuarios-permisos-resumen.md), validada por el cliente. La entrega siguiente unifica [filtros, base de Informes y navegación por categorías](filtros-informes-menu.md). El cliente aceptó el PR #30 (filtros de Caja, rangos comunes y subtotales). INF-04, Cheques de terceros, quedó integrado en el PR #31. INF-09 y PDF/impresión de INF-06 quedaron aceptados en el PR #32; el ajuste de importes y panel de Cajas quedó integrado en el PR #33. Los PR #34/#35 incorporaron plantillas, WhatsApp manual, Tabs y formato argentino. La entrega actual agrega la ficha Varios clientes (CLI-01), con filtros y mensajes personalizados para copiar/abrir individualmente. La ficha se simplifica a consulta directa, sin CheckBox ni acciones de selección. Este documento reúne el alcance vigente y los pendientes; las referencias a «próximas etapas» de documentos anteriores describen el estado que tenían en ese momento.

## Prioridad vigente

**Informes pendientes en pausa hasta nuevo aviso del cliente (03/11/2026).** Sus alcances se conservan en este documento; no se desarrollan ni habilitan informes adicionales en esta entrega. La prioridad es CLI-01: primera versión de Envío de mensajes con selección individual, saldo neto del Resumen hasta hoy, plantilla personal con variables, vista previa, copia y enlace WhatsApp con confirmación manual del envío. La entrega actual suma preparación para varios clientes, sin integración WhatsApp/SMS, envíos automáticos ni programación. Ver [alcance, permisos y aceptación](envio-mensajes.md).

## Primera versión funcional

El objetivo es permitir la operatoria diaria de apuestas, premios, cobros y pagos del cliente, que actualmente utiliza **una sola caja**. La arquitectura admite varias cajas, pero no exige incorporar traspasos para comenzar a trabajar. Los cheques propios **no forman parte del alcance inicial**.

La revisión del código encuentra implementado el circuito solicitado. No se identificó una funcionalidad adicional imprescindible para este alcance. Esto confirma cobertura funcional en el repositorio; no certifica el estado de la base ni del despliegue en Hostinger.

| Necesidad | Implementación y alcance real |
|---|---|
| Registrar apuestas pendientes de cobro | Cuenta corriente: comprobante con Cuenta **Cobrar**, Naturaleza **Deuda** y Sentido **No aplica**; cliente, concepto opcional, número, fechas, importe y observaciones. |
| Registrar premios pendientes de pago | Cuenta corriente: Cuenta **Pagar**, Naturaleza **Deuda** y Sentido **No aplica**. Las dos cuentas se controlan separadamente. |
| Consultar movimientos y pendientes | Listado, filtros, consulta y Propiedades de Cuenta corriente. El selector **Afectar** muestra los documentos pendientes del cliente y cuenta elegidos, su importe original y pendiente real. El primer informe de saldos actuales por cliente está implementado en la entrega en revisión. |
| Cobrar y pagar total o parcialmente | Cobros y pagos: afectaciones múltiples, importes parciales definidos en el OffCanvas y revalidación del pendiente al guardar. **Cobro: Cobrar / Crédito / Ingreso. Pago: Pagar / Crédito / Egreso.** |
| Evitar duplicar la cancelación | El cobro/pago genera su crédito comercial interno y sus afectaciones en una misma transacción. Las afectaciones reducen el pendiente documental; no vuelven a descontar el importe del saldo comercial. El asiento interno se conserva aunque no aparezca en el listado principal de Cuenta corriente. |
| Trabajar con caja diaria | Apertura con saldo inicial, elección explícita de la apertura activa, movimientos y cierre con teórico, contado y observación obligatoria si hay diferencia. La siguiente apertura tiene saldo inicial ingresado por el usuario; no hay arrastre automático. |
| Agregar o retirar efectivo durante la jornada | Tesorería: ingresos y retiros internos con concepto, sin cliente ni afectaciones de Cuenta corriente. El saldo físico considera únicamente efectivo; los cheques y transferencias no lo consumen. |
| Registrar cheques recibidos y utilizarlos en pagos | Alta desde el cobro, estado En cartera y selección de cheques disponibles desde el pago. El uso genera Endoso y evita volver a utilizar el mismo instrumento. |
| Depositar y acreditar cheques de terceros | Valores: depósito de cheques en cartera y acreditación efectiva de depositados. El depósito no ingresa dinero al banco; la acreditación registra un único ingreso por cheque en la cuenta de destino. |
| Consultar estado e historial de valores | Valores: filtros, Propiedades, Historial y Operaciones relacionadas. Se conservan los eventos anteriores aunque una operación de caja se anule. |
| Registrar transferencias en cobros y pagos | Cada transferencia se relaciona con el movimiento de caja y su asiento bancario, con cuenta, importe, fecha y referencia. Se combinan medios de pago y se controla que su suma coincida con afectaciones más importe a cuenta. No se ejecuta una transferencia real desde la aplicación. |
| Corregir movimientos de caja | Anulación en la misma apertura seleccionada y abierta; reversión de una apertura cerrada mediante contramovimiento en la actual. Se conservan vínculo y cierre histórico. La reversión exige comprobante asociado y Numerador válido. Hay restricciones cuando un cheque ya tiene eventos posteriores. |
| Rechazos de terceros depositados/acreditados | Implementado: conserva el Recibo y sus afectaciones, genera deuda por el cheque y absorbe el anticipo disponible del Recibo cuando corresponda. Si estaba acreditado, exige confirmar el débito bancario real y registra su contrapartida. No incluye cheques endosados. |

### Límites que debe conocer el usuario

- **Consulta de saldos:** el listado operativo de Cuenta corriente conserva su presentación. La opción Informes → Listado de Cuenta corriente muestra saldos actuales por cliente y separa, en Propiedades, el pendiente documental y los créditos sin aplicar. La consulta histórica a una fecha todavía no está implementada. El nuevo Resumen incorpora el mayor cronológico del saldo vigente.
- **Anticipos:** se pueden registrar importes a cuenta y consultar su remanente. Todavía no existe una acción general para aplicarlos a documentos futuros o compensar créditos independientes. Para el circuito básico de esta versión, trabajar con medios de pago iguales al total afectado y dejar el importe a cuenta en cero. Esto es una pauta de uso; no se agregó una restricción al sistema. Las compensaciones automáticas de reversión y rechazo tienen un alcance específico.
- **Bancos:** se registran los efectos bancarios de transferencias y eventos de cheque. No existe saldo inicial bancario, control de disponibilidad/descubierto ni conciliación. Los fondos reales se verifican en el banco; no presentar el historial registrado como saldo disponible completo.
- **Correcciones de Valores:** no hay una acción general para deshacer depósitos, acreditaciones o rechazos. Tampoco se resuelve todavía el rechazo de un cheque endosado. Las restricciones actuales evitan corregir automáticamente una operación con dependencias posteriores.
- **Cierre:** la diferencia de caja se registra, sin generar un ajuste automático ni cambiar cierres anteriores. No hay traspasos entre cajas ni entre caja y banco.

Estos límites no impiden la operatoria básica descrita cuando no se necesita utilizar esas funcionalidades adicionales. Si el cliente requiere anticipos reutilizables, rechazos de endosados o correcciones bancarias desde el primer día, el pendiente correspondiente pasa a ser requisito de esa entrega.

### Comprobación final de aceptación

No requiere desarrollar otro módulo. Realizarla en el entorno que utilizará el cliente, con el código y las migraciones vigentes, incluida **0008_rechazo_cheques**. Los casos financieros ya tienen pruebas de integración en el repositorio; la entrega de Usuarios e Informes incorpora verificaciones adicionales de acceso y de estos circuitos.

1. Configurar apuestas como Cobrar/Deuda y premios como Pagar/Deuda; configurar Cobro y Pago según la tabla anterior. Crear clientes, caja, conceptos y cuentas bancarias necesarios. Comprobar Numeradores y comprobantes de reversión si se utilizarán.
2. Abrir y seleccionar la caja. Registrar una deuda de apuestas de 100 y cobrar 60: pendiente 40. Cobrar los 40 restantes: el documento deja de aparecer entre los pendientes.
3. Registrar un premio de 100 y pagar 60: pendiente 40. Pagar el resto. Probar efectivo suficiente y transferencia sin efectivo, verificando que únicamente el efectivo cambie el disponible físico.
4. Abrir con saldo cero, ingresar efectivo por Tesorería, realizar un pago y un retiro interno. Comparar el efectivo esperado con el teórico del cierre; Tesorería no debe generar deudas de cliente.
5. Recibir un cheque, consultar su cartera e historial y usarlo en un pago: no debe seguir disponible. Con otro cheque, probar depósito y acreditación: un solo ingreso bancario y ninguna nueva cancelación comercial.
6. Probar anulación en la apertura actual y reversión después del cierre, con motivo y comprobante configurado. Verificar pendientes, vínculos, historial del instrumento y conservación del cierre anterior.
7. Registrar una transferencia y consultar su cuenta, sentido, importe y operación relacionada. Confirmar que se conserva la trazabilidad al corregir registraciones y que la aplicación no pretende deshacer una transferencia bancaria real.
8. Cerrar la caja y abrir la jornada siguiente. La apertura cerrada ya no debe habilitar movimientos nuevos. Verificar también consulta y navegación en el dispositivo que utilizará el cliente.

## Registro de pendientes

Estados: **Pendiente de definición**, **Pendiente de implementación**, **Candidato a evaluar** e **Implementado**. Ningún ítem de esta lista autoriza por sí mismo una modificación. Cada entrega debe acordar su alcance, actualizar este documento y enlazar su implementación.

### Requerimientos solicitados explícitamente por el cliente

Estos pedidos se registraron el **02/11/2026**. Se distinguen de las propuestas técnicas posteriores; documentarlos no autoriza el envío de mensajes ni nuevas operaciones financieras.

| ID | Pedido del cliente | Estado y cobertura |
|---|---|---|
| CLI-01 | Envío masivo personalizado de saldos pendientes de Cuenta corriente | **Individual implementado; ampliación Varios clientes en revisión:** mismo módulo y plantilla personal, filtros por tipo/estado/búsqueda, saldos distintos de cero del mayor y acciones Copiar/Abrir WhatsApp por fila. Categoría Notificaciones y permiso actual; el registro manual agrega MENSAJEAVISO mediante migración 0011. Último aviso muestra fecha/saldo y permite consultar el historial compartido. La migración 0010 corresponde a la plantilla personal ya integrada. **Envíos masivos automáticos, programados e integraciones siguen pendientes de definición e implementación.** No se realiza ningún envío. WhatsApp es preferido; SMS y Email son alternativas sujetas a aceptación del rubro, consentimiento y costos. Ver [alcance](envio-mensajes.md) y criterios abajo. |
| CLI-02 | Informes para controlar movimientos y saldos de caja | **Cubierto en los informes aceptados.** INF-02 muestra aperturas/cierres, flujos y diferencias; INF-09 explica cada jornada y emite su detalle en PDF al cerrar, aceptado en el PR #32. |

**CLI-01: primera entrega acordada y análisis pendiente para envíos futuros:**

1. **Definido para la copia individual:** Saldo total neto del Resumen hasta la fecha actual de Argentina, incluyendo anteriores y excluyendo posteriores, con los estados vigentes y textos diferenciados para positivo, negativo y cero. Para futuros envíos, volver a acordar si se utiliza pendiente documental de cobro o saldo neto de Cobrar; tratamiento de anticipos/créditos y de premios por pagar. No generar compensaciones documentales entre Cobrar/Pagar por enviar un aviso, ni denominar deuda a un importe a favor; consultar el neto existente no cancela documentos. Elegir destinatarios, tipos de cliente, fecha de cálculo, importes cero/negativos y eventual umbral mínimo. Reutilizar las reglas financieras existentes y una lectura coherente al preparar el lote.
2. Revisar calidad de Teléfono/Email existentes, normalización internacional, titularidad y preferencia de canal. Esos campos no prueban consentimiento. Registrar consentimiento verificable por canal/finalidad, bajas, exclusiones y forma de no volver a enviar a quien no lo desea.
3. Investigar **WhatsApp Business Platform / API oficial**: alta y verificación del negocio/número, consentimiento, plantillas autorizadas para mensajes iniciados por la empresa, clasificación del mensaje, ventana de atención, límites, calidad, entregabilidad y reglas vigentes. No asumir que una deuda puede enviarse como mensaje gratuito de atención ni utilizar automatización de WhatsApp Web. Cotizar con precios oficiales vigentes y, si aplica, proveedor intermediario.
4. Comparar **SMS** (cobertura local, remitente, límites/segmentos, caracteres, bajas y costo por mensaje) y **Email** (proveedor, dominio, entregabilidad y consentimiento). Estimar costo mensual con cantidad de clientes, frecuencia, país y reintentos; no fijar tarifas sin investigación actualizada. Evaluar también un envío manual asistido si el volumen lo justifica, sin confundirlo con un canal masivo oficial.
5. Acordar texto, moneda, nombre, fecha de saldo y privacidad de la información. Antes de enviar: vista previa, selección/exclusiones y confirmación explícita por un usuario autorizado. Evitar enviar a contactos erróneos o exponer saldos en logs técnicos.
6. Diseñar lotes con control de duplicados/reintentos, límites del proveedor, registro de entregas/fallos/costos y recuperación parcial. Elegir infraestructura y credenciales recién con el canal acordado. Realizar piloto con destinatarios autorizados antes del envío masivo. El envío solo informa: no modifica Cuenta corriente.

### Propuestas y pendientes para futuras entregas

Las tablas siguientes reúnen mejoras funcionales y técnicas surgidas durante el desarrollo. No se atribuyen automáticamente como pedidos explícitos del cliente; conservan su ID, alcance y prioridad a acordar. CLI-01/CLI-02 son el registro de pedidos directos de esta revisión.

### Funcionalidades adicionales

| ID | Pendiente | Estado y criterio para retomarlo |
|---|---|---|
| FUN-01 | Aplicar anticipos de cobros/pagos y créditos independientes a documentos posteriores | Pendiente de definición. Evitar nuevos movimientos ficticios de dinero; definir selección, aplicación parcial, compensaciones y correcciones. Adelantar si el cliente comienza a utilizar saldos a favor. |
| FUN-02 | Traspasos entre cajas | Pendiente de definición. Dos contrapartidas vinculadas y atómicas, aperturas válidas, control de efectivo y correcciones trazables. Sin prioridad para el cliente con una sola caja. |
| FUN-03 | Saldo inicial bancario y movimientos independientes | Pendiente de definición. Definir fecha de corte, ingresos/egresos, ajustes, gastos y comisiones antes de ofrecer saldos completos. |
| FUN-04 | Disponibilidad bancaria y conciliación | Pendiente de definición. Depende de FUN-03; definir fondos registrados/disponibles, descubierto y tratamiento de instrumentos pendientes. |
| FUN-05 | Banco → Caja y Caja → Banco | Pendiente de definición. Opcional y postergado expresamente; incorporar con contrapartidas cuando se desarrolle el circuito bancario, sin complicar los ingresos/retiros de efectivo actuales. |
| FUN-06 | Débito efectivo de cheques propios y circuito posterior | Pendiente de definición. Ya existe emisión, pero no confirmación del débito real ni su circuito completo. Fuera de la primera versión porque el cliente no los utiliza. |

### Mejoras funcionales de módulos existentes

| ID | Pendiente | Estado y criterio para retomarlo |
|---|---|---|
| MOD-01 | Rechazo de cheques de terceros endosados | Pendiente de definición. Contemplar cliente original, destinatario del Pago, obligaciones y eventuales reintegros. No reutilizar sin análisis el rechazo de depositados. |
| MOD-02 | Correcciones de depósito, acreditación y rechazo | Pendiente de definición. Separar error registral de devolución real del banco; conservar eventos y contrapartidas, sin borrar historia ni duplicar deudas. |
| MOD-03 | Devolución/reingreso de instrumentos | Pendiente de definición. Incluye volver a recibir un cheque cuya recepción se anuló y el eventual reingreso de rechazados. La identidad única actual no se libera al anular. |
| MOD-04 | Correcciones con dependencias posteriores y de los propios reversos | Pendiente de definición. Hoy se bloquean casos no soportados; definir la cadena de compensaciones antes de habilitarlos. |
| MOD-05 | Reversiones parciales y redistribución de afectaciones ya confirmadas | Pendiente de definición. Las afectaciones del borrador se quitan y vuelven a seleccionar; no se editan operaciones confirmadas. |
| MOD-06 | Ajustes por diferencias de cierre | Pendiente de definición. Hoy se guardan teórico, contado y motivo. Decidir si realmente se necesita una operación de ajuste, su concepto y autorización. |

### Estética y experiencia de usuario

No quedaron defectos visuales concretos confirmados en esta revisión. Los componentes base existentes ya incluyen tamaños, foco integrado, formatos de fecha/importe/número, SF, listados con orden y scroll horizontal, Propiedades, OffCanvas y secciones con navegación sticky.

| ID | Mejora | Estado y criterio para retomarla |
|---|---|---|
| UX-01 | Ajustes de distribución, tamaños, legibilidad y navegación detectados con uso real | Candidato a evaluar. Registrar pantalla, dispositivo, comportamiento actual y esperado; priorizar problemas concretos sobre un rediseño general. |
| UX-02 | Revisión continua en Safari/iPhone y escritorio | Candidato a evaluar. Conservar zoom manual, foco visible, interacción con teclado y desplazamiento de listados. Corregir en la biblioteca cuando el problema sea compartido. |
| UX-03 | Mantener consistencia de controles y acciones en futuras pantallas | Criterio de desarrollo. Reutilizar DataTable, Propiedades, OffCanvas, FormSections y controles; no crear variantes particulares sin necesidad. |

### Reportes e informes

INF-01 e INF-02 están implementados y aceptados. INF-04 quedó integrado en main con el PR #31. INF-09 y la exportación PDF de INF-06 quedaron aceptados en el PR #32. Los informes adicionales quedan en pausa hasta nuevo aviso. Los demás informes continúan como propuestas para entregas posteriores.

| ID | Informe candidato | Alcance a acordar |
|---|---|---|
| INF-01 | Saldos y pendientes por cliente | **Implementado:** listado de saldos actuales, filtro de cliente mediante SF, totales, scroll continuo y Propiedades con pendiente documental/créditos sin aplicar. El Resumen agrega mayor por período, saldos anterior/posterior por origen, aplicaciones/valores informativos y totales; la reconstrucción histórica de estados sigue pendiente, si se requiere. |
| INF-02 | Resumen diario de caja | **Implementado:** una fila por apertura real, filtros de caja/estado/fecha de apertura, ingresos/egresos físicos, cierres guardados, contado/diferencia y desgloses informativos en Propiedades. Totales de flujos sin sumar saldos entre jornadas. Ver [alcance y aceptación](resumen-diario-caja.md). |
| INF-03 | Cobros, pagos y afectaciones | Consulta por cliente, fecha, comprobante y medio; trazabilidad de anulación y reversión. |
| INF-04 | Cartera y vencimientos de cheques de terceros | **Implementado (PR #31):** estado actual, banco/cliente, emisión/vencimiento, subtotales por estado y total nominal; filtros por banco, estado, cliente y fechas; Propiedades con eventos vigentes. Sin propios ni recepciones anuladas. No representa saldo bancario ni reconstrucción histórica. Ver [alcance y aceptación](informe-cheques-terceros.md). |
| INF-05 | Movimientos bancarios registrados | Transferencias y efectos de cheques, con vigencia de anulados y contrapartidas de reversión. Aclarar que no representa un saldo bancario completo mientras falte FUN-03. |
| INF-06 | Exportación e impresión | **PDF/impresión implementados y aceptados (PR #32):** acción de la base de Informes, consulta completa, cortes y totales, paginado, descarga móvil y uso del mismo PDF para imprimir desde el visor. Excel/CSV pendientes de definición e implementación. Ver [alcance y aceptación](detalle-jornada-exportacion-pdf.md). |
| INF-07 | Ingresos y retiros internos de efectivo | Candidato a acordar: caja/jornada, fecha, concepto, responsable, ingresos, egresos y neto interno; solo Tesorería, sin afectar Cuenta corriente ni mezclar transferencias bancarias. |
| INF-08 | Pendientes por vencimiento y antigüedad | Candidato a acordar después de los controles diarios: deudas documentales pendientes, afectaciones vigentes, cuenta Cobrar/Pagar y vencimientos; distinguir pendientes actuales de reconstrucción histórica y de saldos netos. |
| INF-09 | Detalle de movimientos por caja y jornada | **Implementado y aceptado (PR #32):** apertura real, movimientos comerciales/internos, registro/origen, comprobante, responsable, ingresos/egresos físicos, otros medios informativos y acumulado. Conserva cierres guardados; consulta desde menú y PDF posterior al cierre mediante lógica compartida. Ver [alcance y pruebas](detalle-jornada-exportacion-pdf.md). |

Los informes deben respetar las reglas financieras existentes: las afectaciones no restan dos veces; un original revertido conserva sus efectos históricos y tiene una contrapartida; una anulación registral invalida sus efectos; los movimientos bancarios deben aplicar su predicado de vigencia. Una consulta a fecha de corte requiere analizar también cuándo se registraron las correcciones, no solo el estado actual.

### Orden incremental de informes

| Orden | Informe | Primera entrega recomendada |
|---|---|---|
| 1 · Implementado | INF-02 · Resumen diario de caja | Selección de caja y jornada real (CAJASALDO), apertura/cierre, responsable, saldo inicial, ingresos/egresos en efectivo, teórico, contado y diferencia. Separar Cobros/pagos de aportes/retiros de Tesorería. Transferencias y cheques como medios informativos, sin sumarlos al efectivo físico. Contado/diferencia quedan pendientes mientras la jornada esté abierta. Preservar los importes de cierres ya registrados y ubicar reversos en su jornada real. |
| 2 · Integrado PR #31 | INF-04 · Cartera y estados de cheques de terceros | Una fila por cheque, importe, estado actual, banco, cliente de origen y vencimiento, con subtotales por estado, filtro de banco y rango de vencimientos modificable. Un corte adicional por banco puede evaluarse después de validar el uso. Cartera, depositados, acreditados, endosados y rechazados claramente separados; eventos vigentes desde Propiedades (historial completo de correcciones en Valores). No incluir cheques propios en el primer alcance ni confundir el estado actual con un estado histórico a fecha de corte. |
| 3 · Aceptado PR #32 | INF-09 · Detalle de movimientos por caja/jornada | Detalle por apertura real, efectivo acumulado, medios no físicos informativos, cierre guardado y emisión PDF posterior a un cierre confirmado. Misma consulta y presentación desde menú y cierre; PDF/impresión compartidos en la base (INF-06). |
| 4 | INF-05 · Movimientos bancarios registrados | Cuenta/fechas, ingreso/egreso, transferencia o evento de cheque, referencia, operación relacionada y totales del período. Reutilizar la vigencia financiera existente, sin contar dos veces la transferencia o el evento. Presentar flujo registrado, no saldo bancario disponible: FUN-03/FUN-04 siguen sin definir. |
| 5 | INF-07 · Tesorería interna de efectivo | Aportes/retiros por caja, jornada, concepto, fecha y usuario, con subtotales de ingresos/egresos y detalle de reversión. Puede desarrollarse como ampliación del informe de Caja, reutilizando su consulta/columnas cuando corresponda. Los traspasos y Banco↔Caja siguen pendientes y no se simulan como nuevos movimientos. |
| 6 | INF-03 · Cobros/pagos y afectaciones | Cliente, comprobante/número, fecha, sentido, total de operación, medios, importe aplicado e importe a cuenta, con relaciones desde Propiedades. Una incidencia por operación aunque afecte varios documentos o tenga varios medios. |

La recomendación toma los datos persistidos ya disponibles: CAJASALDO conserva apertura/cierre e importes de cierre; CAJAMOVIMIENTO separa ImporteEfectivo/ImporteTotal y módulo; CHEQUE/CHEQUEEVENTO mantienen estado/eventos; TRANSFERENCIA/BANCOMOVIMIENTO registran efectos por cuenta. No exige desarrollar nueva operatoria financiera para las primeras lecturas.

Última entrega de informes aceptada: **INF-09 y PDF/impresión de INF-06 (PR #32)**. La entrega vigente es la ampliación de CLI-01 a varios clientes con consulta de varios clientes y envío manual individual. La consulta de jornada y su emisión desde el cierre comparten lógica; un fallo del PDF no revierte ni repite un cierre. CLI-01 conserva la copia individual y agrega consulta por filtros para preparar mensajes; los envíos automáticos siguen pendientes. INF-05 (movimientos bancarios registrados) y los demás informes pendientes están en pausa hasta nuevo aviso; evaluar si INF-07/INF-03 requieren informes separados o pueden aprovechar el detalle por jornada para evitar duplicación. Excel/CSV e INF-08 siguen pendientes. Ver [entrega, permisos y prueba](detalle-jornada-exportacion-pdf.md).

### Otras mejoras futuras

| ID | Mejora | Estado y criterio para retomarla |
|---|---|---|
| OTR-01 | Ayuda operativa y ejemplos de configuración | Candidato a evaluar. Convertir los circuitos aceptados en instrucciones breves para el usuario, sin introducir nuevas reglas. |
| OTR-02 | Administración de usuarios y recuperación de acceso | **Implementado:** altas/modificaciones, activación, permisos por menú y restablecimiento por el administrador. Por decisión funcional, el usuario no cambia su contraseña y no se incorpora autoservicio ni envío por correo. |

## Orden propuesto de próximas entregas

1. **Cerrar la primera versión con el alcance anterior**, tras la comprobación integral del cliente. Las funcionalidades excluidas quedan registradas, sin exigir completarlas para comenzar a usar los circuitos cubiertos.
2. **Ajustes estéticos concretos** que surjan del uso, preferentemente pequeños y sobre componentes base. No esperar una interfaz definitivamente terminada para iniciar los informes.
3. **Conservar INF-09 y PDF/cierre aceptados**, junto con los informes anteriores. Los nuevos informes quedan en pausa; priorizar la aceptación de la copia individual de CLI-01 antes de definir integraciones o automatismos. El corte histórico sigue separado.
4. **Demás pendientes por necesidad real**, adelantando FUN-01 si empiezan a registrarse anticipos reutilizables y MOD-01/MOD-02 si se necesitan esos casos de cheques. FUN-06 continúa postergado mientras no se utilicen cheques propios.

## Referencias para verificar la implementación

- Cuenta corriente: `apps/api/src/current-account/store.ts`, `apps/web/src/components/current-account/` y `tests/integration/current-account.test.ts`.
- Cobros/pagos, pendientes y caja diaria: `apps/api/src/cash-movement/store.ts`, `apps/web/src/components/cash-movement/`, `tests/integration/cash-movement.test.ts` y `tests/integration/cash-corrections.test.ts`.
- Tesorería: servicio compartido de movimientos, `apps/web/src/components/treasury/TreasuryForm.tsx` y `tests/integration/treasury.test.ts`.
- Valores: `apps/api/src/values/`, `apps/web/src/components/values/`, `tests/integration/values.test.ts`, `tests/integration/cheque-deposits.test.ts` y `tests/integration/cheque-rejections.test.ts`.
- Reglas detalladas: [Cobros y pagos](etapa-6.md), [anulación y reversión](caja-anulacion-reversion.md), [Tesorería](etapa-7.md), [Valores](etapa-8.md) y [numeración vigente](numeracion-comprobantes.md).


Ajustes de interfaz posteriores: Usuarios adopta FilterDialog; Informes compone ReportView con filtros iniciales y SF; el sidebar incorpora categorías y recorte dinámico. No modifican los pendientes financieros ni habilitan corte histórico o exportaciones. Ver [detalle y aceptación](filtros-informes-menu.md).


Entrega de Listado y Resumen: Listado por Tipo/Cliente sin KPI; mayor cronológico de cliente obligatorio con totales y vínculos informativos, sin multiplicar importes. Acordeón exclusivo y sangría en submenús. Ver [reglas y aceptación](listado-resumen-cuenta-corriente.md). No se habilita corte histórico ni exportación.

Ajuste de Informes: scroll continuo sin paginación visible, exclusión de anulados en consultas/relaciones, filtros de fechas con Saldo anterior y Saldo a vencer por fecha de origen, sin tarjetas descriptivas. Ver [criterios obligatorios de informes actuales/futuros](criterios-informes.md). No se modifica la registración financiera ni el esquema.

Mejora de Resumen de Cuenta corriente: tres KPI opcionales, habilitados únicamente en ese informe (Débitos/Créditos del período y Saldo total al cierre), desde los totales existentes. Listado conserva su diseño sin KPI. La propuesta de informes siguiente es de planificación y no agrega rutas, permisos, módulos o cálculos nuevos.

Entrega incremental de Caja: INF-02 desarrollado, ajuste de nombres y Total general en el Listado y Cuenta oculta en el mayor. No hay modificaciones de esquema o registración financiera. Los informes de cheques, bancos y Tesorería separados se mantienen para próximas entregas. Ver [pruebas y permisos](resumen-diario-caja.md).

Entrega de Cheques de terceros: INF-04 sobre la base existente, sin cambios financieros ni migraciones. CLI-01 y CLI-02 quedan enumerados como pedidos explícitos; INF-09 se registra como propuesta complementaria de Caja, sin implementarlo. Ver [archivos, permisos y pruebas](informe-cheques-terceros.md).

Entrega de detalle por jornada y PDF: INF-09 permite explicar una apertura real y emitir desde el mismo cierre confirmado. INF-06 implementa PDF/impresión en la base para todos los informes; CSV/Excel siguen pendientes. No modifica tablas ni la transacción de cierre. Ver [archivos y aceptación](detalle-jornada-exportacion-pdf.md).

Ampliación CLI-01 (04/11/2026): Varios clientes dentro de Envío de mensajes, con filtros simples, plantillas compartidas con la sección individual, saldos distintos de cero del mayor y acciones manuales por fila. Se retiran los CheckBox, las acciones de selección y el filtro visible de saldo neto. La consulta conserva los permisos y no realiza envíos automáticos; el registro manual requiere la tabla MENSAJEAVISO (0011). Los informes permanecen en pausa. Ver [guía y aceptación](envio-mensajes.md).

Registro manual CLI-01: acción de tilde con encabezado Registrar envío y confirmación explícita; Último aviso muestra fecha e importe. Historial compartido por cliente, sin periodicidad ni marca permanente. Copiar/abrir WhatsApp no registra nada. Migración 0011; no afecta Cuenta corriente ni envía mensajes.
