# Anulación, reversión e identificación de movimientos de Caja

Esta entrega distingue ambas correcciones usando la apertura real de CAJASALDO. No agrega campos ni tablas, y no necesita migraciones. CajaMovimientoOrigen ya existe como FK con unicidad desde 0003; no se agrega una columna Origen, tampoco al listado.

## Identificación

| Registro | Presentación en Estado | Persistencia |
|---|---|---|
| Cobro/pago vigente | Confirmado | Estado CONFIRMADO, sin CajaMovimientoOrigen |
| Movimiento anulado en su apertura | Anulado | Estado ANULADO y datos de anulación |
| Original contrarrestado por otro movimiento | Revertido | Estado SQL CONFIRMADO; el vínculo inverso identifica su reversión |
| Movimiento generado por reversión | Confirmado · Reversión | Estado CONFIRMADO, CajaMovimientoOrigen apunta al original |

RevertidoPor y los datos de jornada/usuario son proyecciones de la API, no nuevas columnas. El original revertido conserva su efecto histórico; los cálculos financieros usan sus registros confirmados y la contrapartida. No excluirlo de sumas por su etiqueta visual derivada.

El filtro Estado ofrece Todos, Confirmados, Anulados y Revertidos. Confirmados incluye reversos confirmados y excluye originales revertidos. La carga manual, ordenamiento, selección y fechas de filtros mantienen su funcionamiento.

## Cuándo se ofrece cada acción

- Anular: mismo ID de apertura seleccionada que el CajaSaldo del movimiento, y apertura aún ABIERTA/activa. No se compara solo la caja física ni el calendario. Una apertura que permanece abierta después de medianoche sigue siendo la misma jornada.
- Revertir: apertura original CERRADA y otra apertura actualmente abierta seleccionada. Reabrir la misma caja física genera un ID de apertura nuevo y permite la reversión, no la anulación directa.
- Otra apertura seleccionada mientras la original sigue abierta: ambas correcciones quedan deshabilitadas; seleccionar la apertura original para anular.
- Sin apertura válida seleccionada: no se puede confirmar una corrección. Abrir Administrar caja en el listado, abrir/seleccionar una y volver a consultar el movimiento.
- Anulados, originales ya revertidos y movimientos que son reversos no ofrecen una nueva corrección. No se incorpora reversión de reversos.

El formulario muestra Anular o Revertir según corresponda y el toolbar del listado usa el mismo criterio. Al guardar se vuelve al listado, con su actualización habitual. Las comprobaciones del servidor se repiten dentro de la transacción aunque el navegador tenga información anterior: cerrar una caja mientras otro usuario prepara una anulación no permite alterar ese cierre.

## Anulación de la jornada actual

POST /api/caja-movimiento/:id/anular requiere sesión con permiso de escritura, CSRF, If-Match, Idempotency-Key, CajaSaldo seleccionado y Motivo. El servidor bloquea apertura, movimiento, cuentas relacionadas y cheques para comprobar vigencia y dependencias.

- Marca CAJAMOVIMIENTO y su crédito interno de CUENTACORRIENTE como ANULADO, registrando usuario, instante y motivo. No crea un nuevo comprobante ni retrocede el numerador.
- Conserva las filas de CAJAMOVIMIENTOAFECTACION. Al no pertenecer a una caja confirmada dejan de computarse y el documento original recupera su pendiente. El crédito anulado deja de reducir el saldo neto; no se agrega otra contradeuda.
- Conserva el número original y su unicidad. No puede utilizarse nuevamente aunque el registro esté anulado.
- El saldo físico se calcula excluyendo el anulado. Antes de confirmar se verifica que retirar el efecto original no produzca saldo negativo ni supere el máximo. Por ejemplo, un cobro de 100 seguido de un pago de 80 no puede anularse si solo quedan 20 de efectivo.
- Un crédito con aplicaciones posteriores o inconsistencias entre total, anticipo y afectaciones bloquea la operación. Ningún fallo debe dejar una parte anulada y otra vigente: auditoría, cambios y solicitud idempotente pertenecen a la misma transacción.

## Transferencias y libro bancario

El usuario confirmó que la anulación con transferencia es una corrección de registración, no una devolución bancaria automática. El diálogo exige marcar explícitamente esa declaración; el servidor exige ConfirmarCorreccionBancaria=true cuando encuentra transferencias reales en la base, no solo según lo informado por el cliente.

TRANSFERENCIA y BANCOMOVIMIENTO se conservan íntegros. El valor se presenta como ANULADA cuando su movimiento de caja está anulado. La vigencia del asiento bancario se deriva de su movimiento confirmado vinculado, sin inventar una columna Estado bancaria. database/bank-movements.ts centraliza effectiveBankMovement para consultas de libro bancario y registra instantáneas de vigencia antes/después en la auditoría.

Todo futuro saldo/informe de BANCOMOVIMIENTO debe aplicar esa vigencia, no sumar indiscriminadamente registros históricos. Un reverso conserva activos el asiento original y el contrario, que se compensan; una anulación registral invalida el asiento original sin borrarlo. Esto no implementa disponibilidad bancaria, conciliación ni políticas de descubierto.

Si la transferencia ocurrió realmente y se pretende recuperar el dinero, se necesita la devolución/regularización real. La confirmación no envía órdenes al banco ni comprueba movimientos externos al sistema.

## Cheques

Solo puede deshacerse el evento original sin eventos posteriores y con el estado esperado:

| Operación anulada | Estado resultante | Evento conservado/agregado |
|---|---|---|
| Recepción de un tercero | RECEPCION_ANULADA, fuera de cartera | ANULACION_RECEPCION |
| Emisión propia | ANULADO | ANULACION |
| Endoso de un tercero | CARTERA | RECUPERACION |

No se eliminan instrumentos ni eventos. La consulta de valores evita duplicar un mismo cheque cuando el movimiento contiene el evento original y el de anulación/recuperación. Una recepción anulada no equivale a cancelar legalmente el cheque del tercero.

Limitación conservada: la identidad del instrumento sigue siendo única. Anular una recepción no habilita crear otro cheque con esa misma identidad; volver a recibirlo requerirá un circuito específico. Un evento posterior, incluso con historia compensatoria, requiere revisar su circuito antes de corregir el anterior. Esta entrega no decide automáticamente cómo deshacer depósitos, rechazos u otras operaciones futuras.

## Reversión de una jornada cerrada

Conserva la operación original y el cierre. Registra en la apertura seleccionada un comprobante contrario con fecha actual, su número propio, motivo y FK CajaMovimientoOrigen. El servidor ahora exige explícitamente que la apertura original esté cerrada, además de las condiciones existentes de comprobante, saldo, aplicaciones y cheques.

Se mantiene el tratamiento de Cuenta corriente: crea la contradeuda y conserva las afectaciones originales; no reabre además el documento original. El anticipo se compensa contra esa contradeuda para no duplicar pendientes. Se mantienen también las transferencias contrarias y los eventos de cheque del circuito existente. No cambia el importe ni el estado SQL del movimiento original, ni el saldo teórico/contado de su cierre.

## Propiedades y consulta

CashProperties reutiliza RecordProperties y el OffCanvas base. Muestra estado, caja, fecha/hora de apertura, usuario, anulación y motivo, junto con los campos funcionales existentes.

- Original: Revertido por, con descripción/número, fecha y apertura del reverso.
- Reverso: Revierte a, con los mismos datos del original.
- Consultar movimiento relacionado navega dentro del mismo panel; Volver regresa al anterior. No muestra IDTabla ni crea componentes específicos de panel.
- El enlace existente desde el formulario también conserva datos correctos al cambiar de comprobante; se recrea el estado del formulario usando la identidad del movimiento.

## Archivos y verificación

- API: cash-movement/store.ts, routes.ts, validation.ts y database/bank-movements.ts.
- Contratos y presentación derivada: packages/shared/src/cash-movement.ts.
- Interfaz: CashPage.tsx, CashForm.tsx, CashActions.tsx, CashProperties.tsx y services/cash-movement.ts.
- Pruebas: tests/cash-corrections.test.ts, tests/integration/cash-corrections.test.ts y scripts/integration.mjs.

Los chequeos de tipos y 46 pruebas unitarias pasan. La integración completa sobre MySQL 8.4 y MariaDB 11.8.9 usa bases efímeras: comprueba restauración de pendientes/anticipos, número conservado, permisos, confirmación bancaria, vigencia de libro bancario, cheques sin duplicados, dependencias, rollback de auditoría, idempotencia, competencia con cierre y preservación del cierre histórico. Chromium con API simulada comprueba ambas acciones, selección de apertura, filtros, navegación bidireccional y móvil. No se operó sobre Hostinger ni se ejecutaron migraciones o compilación de producción.

Prueba manual:

1. Con una caja abierta seleccionada, cargar un cobro/pago y consultarlo. Debe ofrecer Anular. Cancelar el diálogo conserva el movimiento; confirmar con motivo vuelve al listado. Consultar Anulados y comprobar motivo/usuario y pendiente restaurado.
2. Si tiene transferencias, completar motivo sin marcar la declaración: Confirmar permanece deshabilitado. Marcarla solo para una corrección registral y verificar el estado del valor en consulta/Propiedades.
3. Seleccionar otra apertura aún abierta: no debe permitir anular el registro de la anterior ni ofrecer una reversión como alternativa. Volver a seleccionar la original.
4. Cerrar la jornada y abrir otra de la misma caja: el registro anterior ofrece Revertir. Confirmar con comprobante compatible y motivo. El cierre anterior debe permanecer igual.
5. Con Todos/Revertidos consultar Propiedades del original y acceder al reverso; desde éste consultar el original y usar Volver. El original muestra Revertido; el nuevo, Confirmado · Reversión, sin columna Origen.
6. Probar recepción/emisión/endoso de cheques, falta de caja seleccionada y efectivo insuficiente. Los eventos posteriores deben bloquear correcciones incompatibles. Repetir navegación en móvil.
