# Efectivo, fondos bancarios e ingresos de Tesorería

Análisis de la revisión de pagos; no modifica reglas financieras ni la base de datos. La incidencia informada de transferencia pudo completarse en el nuevo intento y el usuario pidió dejarla en observación. No se atribuye su causa al componente monetario ni al saldo físico sin evidencia del fallo.

## Validaciones actuales comprobadas en el código

CashForm calcula los medios como Efectivo + Propios/Transferencias + Terceros, y los compara contra Afectaciones + Adelanto/Anticipo. No compara el neto con el efectivo disponible. El servidor vuelve a validar esta igualdad y las afectaciones dentro de la transacción.

En cash-movement/store.ts, cashBalance calcula SaldoInicial más ingresos menos egresos de **ImporteEfectivo**, y checkCashBalance recibe únicamente el efecto de ImporteEfectivo del movimiento. No recibe ImporteTotal. Un pago por transferencia con Efectivo=0 no descuenta caja física. Todos los medios siguen requiriendo una caja abierta seleccionada para el control operativo acordado.

- Efectivo: se controla el saldo físico, bloqueando la apertura al confirmar. Un egreso mayor que el efectivo disponible se rechaza.
- Transferencia: se valida cuenta y banco activos. Se genera TRANSFERENCIA y el asiento en BANCOMOVIMIENTO con su sentido. No se compara contra caja física.
- Cheque propio: se valida cuenta/banco, identidad única, datos y emisión. La emisión registra CHEQUE/CHEQUEEVENTO, sin un débito bancario inmediato.
- Cheque de terceros: para un pago se selecciona de cartera, con bloqueo y control de estado/uso exclusivo; se registra el endoso. No representa un egreso de efectivo.
- Combinados: se suman los medios para compensar el total, pero el control de caja física recibe solo el efectivo. Un pago de 100.000 por transferencia es distinto de uno con 10.000 de efectivo y 90.000 de transferencia: el segundo requiere esos 10.000 en caja.

## Disponibilidad bancaria: propuesta pendiente

Actualmente no existe un control de saldo bancario disponible ni una apertura de saldo bancario en el maestro BANCOCUENTA. Los movimientos bancarios registrados pueden no representar aún todos los fondos reales de la cuenta. Validar un egreso contra la suma de esa historia incompleta, suponiendo un saldo inicial cero, podría bloquear pagos válidos.

Para incorporar ese control en Tesorería se debe definir por cuenta un saldo inicial a fecha de corte y registrar los movimientos que forman el saldo. Distinguir saldo registrado/conciliado, fondos disponibles, posibilidad/límite de descubierto y cheques propios emitidos pendientes de débito. Definir si esos cheques reservan disponibilidad y cuándo se libera o consume esa reserva; no confundir emisión con débito efectivo ni contar dos veces el importe.

Las futuras comprobaciones de disponibilidad deben sumar lo utilizado por cuenta en toda la operación y ejecutarse bajo bloqueo/transacción para evitar que dos pagos consuman los mismos fondos. Estas decisiones requieren validación funcional antes de implementarse. Esta revisión no elimina controles ni habilita implícitamente nuevas políticas bancarias.

## Agregar efectivo después de abrir una caja

Recomendación: resolverlo desde la próxima etapa de Tesorería, con comprobantes/conceptos de movimientos internos de fondos y reutilizando listados, formularios y controles existentes.

1. Aporte o ingreso directo: registrar un ingreso de efectivo con su concepto y origen, fecha, usuario y auditoría. Con caja inicial 0 e ingreso 100.000, el saldo actual pasa a 100.000. El saldo inicial original sigue siendo 0.
2. Banco → caja: registrar una salida de banco y una entrada de efectivo vinculadas en una transacción; no crear crédito o deuda de cliente por el traslado.
3. Caja → caja: registrar salida de la caja origen y entrada en la destino, ambas abiertas y con control de disponibilidad en origen. Preservar la vinculación y trazabilidad del traspaso.

No utilizar un cobro ficticio o un adelanto de cliente para fondear una caja: el circuito actual genera un crédito en Cuenta corriente y alteraría indebidamente su saldo. Tampoco editar el saldo inicial después de operar ni cambiar una caja cerrada. Las correcciones de operaciones históricas deben conservar los cierres y seguir el circuito de contramovimientos acordado.

El alcance inicial de Tesorería puede comenzar por ingresos/egresos internos simples; los traspasos y el control de disponibilidad bancaria se incorporan con su origen/destino y política definidos. Reutilizar CAJAMOVIMIENTO, BANCOMOVIMIENTO y los vínculos existentes cuando correspondan; revisar el enlace de traspasos antes de afirmar que no requiere ajustes. CajaMovimientoOrigen ya identifica reversiones y no debe reutilizarse indiscriminadamente para otro circuito. No se crean tablas, campos ni flujos nuevos en esta entrega.
