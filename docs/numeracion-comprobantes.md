# Numeradores compartidos

COMPROBANTE selecciona opcionalmente su Numerador mediante FK a NUMERACION.Codigo. Varios comprobantes, incluso de distintos módulos, pueden compartir la misma secuencia. La tabla física conserva su nombre NUMERACION y su IDTabla interno; el ABM permite Código manual, Próximo número, Caja opcional y Activo. El código queda fijo después del alta, como los demás maestros.

## Comportamiento

- Con numerador activo y válido, el componente muestra la sugerencia como **solo lectura**. El servidor asigna el número definitivo al guardar; la vista previa no reserva números. Otro usuario puede consumir la sugerencia y el guardado tomará el siguiente disponible.
- Cuenta corriente utiliza el numerador configurado sin depender de una caja seleccionada, incluso cuando el numerador tiene Caja.
- Cobros y pagos y Tesorería usan un numerador general (Caja NULL) o uno cuya Caja coincida con la caja física de la apertura seleccionada. Una nueva jornada de esa misma caja continúa la secuencia; no la reinicia.
- Sin configuración válida, por ausencia, inactividad o caja diferente, el componente comienza en 0000/00000000 y muestra un aviso. El usuario puede ingresar un número manual válido; esta situación no impide trabajar. Las emisiones manuales no consumen ni adelantan el numerador incompatible/inactivo; conservan la unicidad del comprobante.
- Las reversiones mantienen su requisito de un numerador activo y compatible con la caja. No admiten alternativa manual: solo Motivo es editable.
- Caja no determina el punto de venta. Los cuatro dígitos forman parte del Próximo número configurado y pueden ser distintos del código de caja.

Ejemplo: RECIBO y PAGO asociados a GENERAL, cuyo Próximo número es 0001-00000100. Confirmar RECIBO asigna 100; confirmar PAGO asigna 101; el siguiente RECIBO asigna 102. Todos comparten un único correlativo.

## Representación y almacenamiento

NumeroComprobante conserva dos inputs unidos y el formato de cuatro y ocho dígitos. Los movimientos mantienen **un solo BIGINT**: punto × 100000000 + correlativo. Por ejemplo, 0001-00000025 se almacena como 100000025, y 0012-00000001 como 1200000001. No se almacena el guion ni se agregan columnas de serie o FK al numerador en CUENTACORRIENTE/CAJAMOVIMIENTO.

El rango es punto 0000–9999, correlativo 00000001–99999999. El cero inicial del control no es un número manual válido para guardar. Los enteros viajan como texto decimal y se calculan con BigInt. El último correlativo desactiva el numerador; no cambia de punto automáticamente. Los cheques mantienen sus números e identidad bancaria propios.

## Consumos e integridad

NUMERACIONUSO es un registro técnico de emisiones, sin ABM: conserva Numerador interno, Comprobante, número completo y fecha. Sus claves únicas impiden repetir un número dentro del mismo numerador y reutilizar un comprobante/número ya consumido. El cobro/pago y su asiento interno de Cuenta corriente representan una única emisión y registran un solo consumo.

- Anular o revertir no libera números ni retrocede la secuencia.
- Cambiar qué numerador utiliza un comprobante afecta las operaciones futuras; no traslada ni elimina sus consumos anteriores.
- Un numerador utilizado se desactiva; no se elimina aunque ya no tenga comprobantes asociados.
- Para eliminarlo, no debe tener comprobantes asociados ni emisiones en NUMERACIONUSO. El mensaje de eliminación distingue ambas dependencias. Caja es una referencia del numerador hacia el maestro y, por sí sola, no impide borrar un numerador sin uso. Las FK antiguas desde CUENTACORRIENTE/CAJAMOVIMIENTO se eliminaron en la migración 0002; el historial de consumos fue incorporado en la 0006 y es una dependencia vigente.
- Al editar o reactivar un numerador, su Próximo número debe superar los consumidos en ese punto, incluyendo anulados, consumos de comprobantes antes asociados e historia de los actualmente asociados.
- Asociar un comprobante con historia anterior requiere un próximo número seguro. Si debe ajustarse, se informa en el campo Numerador y no se cambia silenciosamente su configuración ni los movimientos. Crear GENERAL con un valor superior al máximo histórico es una forma de agrupar comprobantes anteriores.
- Las emisiones manuales anteriores siguen protegidas por comprobante/número. Si ocupan valores de una secuencia asociada posteriormente, la asignación automática evita reutilizarlos.

`database/numbering.ts` centraliza sugerencias, compatibilidad por caja, asignación y validación de máximos para Cuenta corriente, Cobros y pagos y Tesorería. Valores deberá utilizarlo cuando incorpore emisión de comprobantes; no tiene otra implementación de numeración.

La transacción bloquea primero el comprobante y luego la fila del numerador. Compartirlo entre comprobantes o instancias sigue serializando la asignación. Consumo, incremento, movimiento, auditoría y solicitud idempotente se confirman juntos o se revierten juntos. Las reversiones bloquean ambos comprobantes antes del numerador para mantener el mismo orden.

En altas automáticas el cliente envía NumeroAutomatico=true y NumeroComprobante=0 como marcador, manteniendo visible la sugerencia real. El servidor no utiliza ese marcador como número almacenado. La identidad idempotente excluye la sugerencia variable: una respuesta perdida o un refresco de opciones no genera otro movimiento al reintentar. Si cambia la configuración entre edición y confirmación, se informa el cambio y se pueden actualizar las opciones preservando el borrador.

## Migración 0006

No se modifican los números, importes, estados, claves ni cierres de los movimientos existentes.

1. NUMERACION conserva IDTabla, ProximoNumero y Activo. Agrega Codigo (inicialmente igual al antiguo Comprobante) y Caja=NULL.
2. COMPROBANTE agrega Numerador y recibe la relación que antes estaba en NUMERACION.
3. NUMERACIONUSO incorpora los números históricos de los comprobantes que tenían numerador. Se reconoce el asiento interno vinculado de un cobro/pago para registrar una sola emisión.
4. Solo después de copiar las relaciones se elimina NUMERACION.Comprobante y su restricción única. No se fusionan numeradores automáticamente: luego se puede seleccionar el mismo desde varios comprobantes.

Quedan 21 tablas de negocio más NUMERACIONUSO: `db:check` debe informar **22/22**, además del historial técnico de migraciones.

El preflight identifica duplicados reales y un DDL parcial antes de ejecutar cambios. No elimina, fusiona ni renumera datos ambiguos. En bases anteriores también se ejecutan las comprobaciones de las migraciones 0002/0003. Ante una migración interrumpida hay que revisar su estructura e historial; MySQL/MariaDB no revierten automáticamente todo el DDL.

### Publicación en Hostinger

Codex no inspeccionó ni modificó la base del alojamiento. Tanto producción como las vistas previas necesitan actualizar su esquema; un enlace de PR no garantiza una base independiente.

1. Identificar la aplicación/base correcta y detener **todos** los procesos que escriben en ella durante la actualización. Con datos relevantes, obtener un respaldo verificado.
2. Publicar el código nuevo y entrar por SSH al directorio activo que contiene el package.json raíz. Hostinger cambia la carpeta real entre despliegues; no ejecutar desde una versión eliminada.
3. Con las variables DB disponibles también en SSH, ejecutar:

   ```bash
   npm run db:numbering:check:prod
   npm run db:migrate:prod
   npm run db:check:prod
   ```

   Ejecutar el siguiente solo si el anterior termina correctamente. El primero es de solo lectura; el segundo aplica migraciones pendientes y repite el preflight. No importar el SQL directamente ni usar db:generate en el alojamiento.
4. Reiniciar/reanudar la aplicación, recargar los formularios y verificar 22/22 tablas. El código anterior depende de NUMERACION.Comprobante y no es compatible con el esquema nuevo; una vuelta atrás requiere un procedimiento coordinado.

## Cómo probar

1. Revisar los numeradores migrados: mismo correlativo/estado, Código del comprobante anterior y Caja vacía. Consultar movimientos anteriores: sus números permanecen iguales.
2. Crear GENERAL, activo, Próximo número 0001-00000100. En Comprobantes asociarlo a RECIBO y PAGO. Guardar operaciones alternadas: 100, 101, 102. Repetir en dos pestañas con la misma sugerencia: ambos guardados deben obtener números diferentes.
3. Crear CAJA01 asociado a una caja. Usarlo desde un comprobante de Cuenta corriente sin seleccionar caja: debe funcionar automáticamente. En Cobros y pagos/Tesorería elegir la caja correspondiente: automático; elegir otra: cero, aviso y entrada manual habilitada, sin avanzar CAJA01.
4. Probar un comprobante sin numerador y otro cuyo numerador esté inactivo: aviso y carga manual. No se debe guardar un cero manual ni repetir número del mismo comprobante.
5. Anular una operación: el próximo número no retrocede. Desasociar un comprobante no debe permitir reutilizar sus consumos ni eliminar el numerador utilizado. Probar error de guardado y reintento: no debe consumir otro número.
6. Configurar una reversión con numerador por caja: caja incompatible impide confirmarla; otra apertura de la misma caja continúa la secuencia correctamente.
7. En Comprobantes revisar Datos generales (Código/Activo, Descripción, Módulo, Orden) y Opciones (Numerador, Cuenta, Naturaleza, Sentido, Exclusivo y Reversión). Probar navegación, sticky y móvil. En filtros debe aparecer Módulo de origen, sin filtro de reversión.
