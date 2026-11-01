# Entregas incrementales y mejoras pendientes

Revisión: **01/11/2026**. Base funcional revisada: implementación integrada hasta el PR #27 (rechazo de cheques de terceros). La entrega posterior incorpora [Usuarios, permisos e informe actual de Cuenta corriente](usuarios-permisos-resumen.md), pendiente de aceptación del cliente. Este documento reúne el alcance vigente y los pendientes; las referencias a «próximas etapas» de documentos anteriores describen el estado que tenían en ese momento.

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

- **Consulta de saldos:** el listado operativo de Cuenta corriente conserva su presentación. La nueva opción Informes → Resumen de Cuenta corriente muestra saldos actuales por cliente y separa, en Propiedades, el pendiente documental y los créditos sin aplicar. La consulta histórica a una fecha todavía no está implementada.
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

Estados: **Pendiente de definición**, **Pendiente de implementación**, **Candidato a evaluar** e **Implementado, en revisión**. Ningún ítem de esta lista autoriza por sí mismo una modificación. Cada entrega debe acordar su alcance, actualizar este documento y enlazar su implementación.

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

INF-01 cuenta con una primera versión en revisión. El resto y las ampliaciones siguen pendientes de definición; no deben incorporarse todos en una sola entrega.

| ID | Informe candidato | Alcance a acordar |
|---|---|---|
| INF-01 | Saldos y pendientes por cliente | **Implementado, en revisión:** resumen de saldos actuales, búsqueda por código/nombre, totales, paginación y Propiedades con pendiente documental/créditos sin aplicar. Pendientes: detalle de aplicaciones/documentos dentro del informe y corte histórico, si se requieren. |
| INF-02 | Resumen diario de caja | Apertura, cobros/pagos por medio, ingresos/retiros de Tesorería, efectivo teórico, contado y diferencia. Identificar la apertura real, no agrupar solo por fecha o caja física. |
| INF-03 | Cobros, pagos y afectaciones | Consulta por cliente, fecha, comprobante y medio; trazabilidad de anulación y reversión. |
| INF-04 | Cartera y vencimientos de cheques de terceros | Disponibilidad, depositados, acreditados, rechazados e historial; evitar confundir cartera con fondos bancarios disponibles. |
| INF-05 | Movimientos bancarios registrados | Transferencias y efectos de cheques, con vigencia de anulados y contrapartidas de reversión. Aclarar que no representa un saldo bancario completo mientras falte FUN-03. |
| INF-06 | Exportación e impresión | Definir después de acordar cada informe: columnas, totales, filtros, permisos y necesidad real de PDF/Excel/CSV. |

Los informes deben respetar las reglas financieras existentes: las afectaciones no restan dos veces; un original revertido conserva sus efectos históricos y tiene una contrapartida; una anulación registral invalida sus efectos; los movimientos bancarios deben aplicar su predicado de vigencia. Una consulta a fecha de corte requiere analizar también cuándo se registraron las correcciones, no solo el estado actual.

### Otras mejoras futuras

| ID | Mejora | Estado y criterio para retomarla |
|---|---|---|
| OTR-01 | Ayuda operativa y ejemplos de configuración | Candidato a evaluar. Convertir los circuitos aceptados en instrucciones breves para el usuario, sin introducir nuevas reglas. |
| OTR-02 | Administración de usuarios y recuperación de acceso | **Implementado, en revisión:** altas/modificaciones, activación, permisos por menú y restablecimiento por el administrador. Por decisión funcional, el usuario no cambia su contraseña y no se incorpora autoservicio ni envío por correo. |

## Orden propuesto de próximas entregas

1. **Cerrar la primera versión con el alcance anterior**, tras la comprobación integral del cliente. Las funcionalidades excluidas quedan registradas, sin exigir completarlas para comenzar a usar los circuitos cubiertos.
2. **Ajustes estéticos concretos** que surjan del uso, preferentemente pequeños y sobre componentes base. No esperar una interfaz definitivamente terminada para iniciar los informes.
3. **Validar el diseño y los resultados de INF-01**, ya implementado para saldos actuales. Acordar luego INF-02 u otro informe según la prioridad del cliente; el corte histórico sigue separado.
4. **Demás pendientes por necesidad real**, adelantando FUN-01 si empiezan a registrarse anticipos reutilizables y MOD-01/MOD-02 si se necesitan esos casos de cheques. FUN-06 continúa postergado mientras no se utilicen cheques propios.

## Referencias para verificar la implementación

- Cuenta corriente: `apps/api/src/current-account/store.ts`, `apps/web/src/components/current-account/` y `tests/integration/current-account.test.ts`.
- Cobros/pagos, pendientes y caja diaria: `apps/api/src/cash-movement/store.ts`, `apps/web/src/components/cash-movement/`, `tests/integration/cash-movement.test.ts` y `tests/integration/cash-corrections.test.ts`.
- Tesorería: servicio compartido de movimientos, `apps/web/src/components/treasury/TreasuryForm.tsx` y `tests/integration/treasury.test.ts`.
- Valores: `apps/api/src/values/`, `apps/web/src/components/values/`, `tests/integration/values.test.ts`, `tests/integration/cheque-deposits.test.ts` y `tests/integration/cheque-rejections.test.ts`.
- Reglas detalladas: [Cobros y pagos](etapa-6.md), [anulación y reversión](caja-anulacion-reversion.md), [Tesorería](etapa-7.md), [Valores](etapa-8.md) y [numeración vigente](numeracion-comprobantes.md).
