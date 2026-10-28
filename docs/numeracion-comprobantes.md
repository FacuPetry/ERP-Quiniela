# Numeradores compartidos

COMPROBANTE selecciona opcionalmente su Numerador mediante FK a NUMERACION.Codigo. Varios comprobantes, incluso de distintos módulos, pueden compartir la misma secuencia. La tabla física conserva su nombre NUMERACION y su IDTabla interno; el ABM permite Código manual, Próximo número, Caja opcional y Activo. El código queda fijo después del alta, como los demás maestros.

## Comportamiento

- Con numerador activo y válido, el componente muestra exactamente el próximo número configurado. En las altas normales ambos inputs son **editables**. Mientras no se edite la sugerencia, el servidor asigna el número automático al guardar; la vista previa no reserva números. Si otro usuario consumió esa sugerencia, se asigna el próximo correlativo de la configuración.
- Si el usuario modifica el punto de venta o el correlativo, el valor pasa a ser manual y se guarda tal como fue ingresado. Con numerador válido, un valor igual o mayor al próximo del mismo punto lo adelanta al siguiente; un valor menor o de otro punto no lo retrocede ni cambia su punto. Si el numerador no es válido para esa caja o está inactivo, una carga manual no lo actualiza.
- Cuenta corriente utiliza el numerador configurado sin depender de una caja seleccionada, incluso cuando el numerador tiene Caja.
- Cobros y pagos y Tesorería usan un numerador general (Caja NULL) o uno cuya Caja coincida con la caja física de la apertura seleccionada. Una nueva jornada de esa misma caja continúa la secuencia; no la reinicia.
- Sin configuración válida, por ausencia, inactividad o caja diferente, el componente comienza en 0000/00000000 y muestra un aviso. El usuario puede ingresar un número manual válido; esta situación no impide trabajar. Las emisiones manuales no consumen ni adelantan el numerador incompatible/inactivo; conservan la unicidad del comprobante.
- Las reversiones mantienen su requisito de un numerador activo y compatible con la caja. No admiten alternativa manual: solo Motivo es editable.
- Caja no determina el punto de venta. Los cuatro dígitos forman parte del Próximo número configurado y pueden ser distintos del código de caja.

Ejemplo: RECIBO y PAGO asociados a GENERAL, cuyo Próximo número es 0001-00000100. Confirmar RECIBO asigna 100; confirmar PAGO asigna 101; el siguiente RECIBO asigna 102. Todos comparten un único correlativo.

## Representación y almacenamiento

NumeroComprobante conserva dos inputs unidos y el formato de cuatro y ocho dígitos. Los movimientos mantienen **un solo BIGINT**: punto × 100000000 + correlativo. Por ejemplo, 0001-00000025 se almacena como 100000025, y 0012-00000001 como 1200000001. No se almacena el guion ni se agregan columnas de serie o FK al numerador en CUENTACORRIENTE/CAJAMOVIMIENTO.

El rango es punto 0000–9999, correlativo 00000001–99999999. El cero inicial del control no es un número manual válido para guardar. Los enteros viajan como texto decimal y se calculan con BigInt. El último correlativo desactiva el numerador; no cambia de punto automáticamente. Los cheques mantienen sus números e identidad bancaria propios.

## Configuración e integridad sin historial de numeradores

NUMERACION es solamente configuración: Código, Próximo número, Caja opcional y Activo. No existe una tabla de consumos ni una relación desde las operaciones hacia el numerador. Los números definitivos se conservan en CUENTACORRIENTE y CAJAMOVIMIENTO. El cobro/pago y su asiento interno de Cuenta corriente se generan con el mismo número y adelantan una sola vez el correlativo.

- Anular o revertir no retrocede ProximoNumero. Los números de los movimientos anulados o revertidos siguen participando en los controles de duplicados.
- Para eliminar un numerador, ningún comprobante debe tenerlo configurado. Si se quitan todas las asociaciones, puede eliminarse aunque se haya usado antes o tenga una Caja asignada. Esto no cambia ni elimina movimientos.
- Se puede asociar un numerador activo a un comprobante y editar o reactivar su Próximo número sin compararlo con movimientos históricos, incluidos los anulados. Se conservan las validaciones de formato, rango y referencias existentes.
- La asignación automática utiliza ProximoNumero. No consulta máximos históricos ni salta silenciosamente a otro número por operaciones anteriores. Guardar o asociar una configuración no consume números ni altera movimientos.
- La unicidad por comprobante/número se valida entre Cuenta corriente y Movimientos de caja, incluidos anulados y revertidos. El bloqueo del comprobante protege también las emisiones manuales simultáneas; cada tabla conserva su restricción única correspondiente.

Eliminar y recrear un numerador crea una nueva configuración: no recupera una secuencia anterior. Al desasociar comprobantes tampoco se mantiene una memoria independiente de qué numerador emitió sus números. Diferentes comprobantes pueden utilizar el mismo número; el comprobante forma parte de su identidad. Esto no elimina los índices UNIQUE existentes sobre (Comprobante, NumeroComprobante) en CUENTACORRIENTE y CAJAMOVIMIENTO. La asociación acepta una sugerencia inferior a números anteriores; si al confirmar coincide exactamente con uno ya registrado para ese mismo comprobante, se informa el duplicado, sin consumir el número. El usuario puede corregirlo manualmente o ajustar la configuración. Las reversiones conservan su numeración automática obligatoria, por lo que ese caso requiere ajustar su numerador.

`database/numbering.ts` centraliza sugerencias, compatibilidad por caja, asignación y avance para Cuenta corriente, Cobros y pagos y Tesorería. El hook useVoucherNumber conserva la sugerencia automática hasta que el usuario la edita, vuelve a sugerir al cambiar comprobante/jornada y conserva las ediciones manuales al actualizar opciones. Valores deberá reutilizar esta lógica cuando incorpore emisión de comprobantes.

La transacción bloquea primero el comprobante y luego la fila del numerador con FOR UPDATE. Compartirlo entre comprobantes o instancias serializa la asignación sobre ProximoNumero, sin un registro adicional de consumos. Incremento, movimiento, auditoría y solicitud idempotente se confirman juntos o se revierten juntos. Las reversiones bloquean ambos comprobantes antes del numerador para mantener el mismo orden. La sugerencia no es una reserva: el número definitivo se asigna al guardar.

En altas automáticas el cliente envía NumeroAutomatico=true y NumeroComprobante=0 como marcador, manteniendo visible la sugerencia real. Una edición manual envía NumeroAutomatico=false y el número real, incluso con numerador activo. El servidor no utiliza el marcador como número almacenado. La identidad idempotente excluye la sugerencia automática variable: una respuesta perdida o un refresco de opciones no genera otro movimiento al reintentar. Si la numeración automática deja de estar disponible antes de confirmar, se informa y se pueden actualizar opciones preservando el borrador.

## Migraciones 0006 y 0007

No se modifican los números, importes, estados, claves ni cierres de los movimientos existentes.

1. NUMERACION conserva IDTabla, ProximoNumero y Activo. Agrega Codigo (inicialmente igual al antiguo Comprobante) y Caja=NULL.
2. COMPROBANTE agrega Numerador y recibe la relación que antes estaba en NUMERACION.
3. La migración 0006 incorporó inicialmente NUMERACIONUSO. Se conserva sin editar como parte del historial de migraciones ya publicado.
4. Solo después de copiar las relaciones se elimina NUMERACION.Comprobante y su restricción única. No se fusionan numeradores automáticamente: luego se puede seleccionar el mismo desde varios comprobantes.

La migración **0007_numeradores_sin_historial** elimina únicamente NUMERACIONUSO y sus dependencias. No modifica NUMERACION, COMPROBANTE, movimientos, importes, afectaciones, cierres, auditoría ni números existentes. Una base nueva recorre ambas migraciones; una base con la 0006 aplicada ejecuta solamente la pendiente. DROP TABLE IF EXISTS permite completar el registro de migración si el proceso se interrumpe después de eliminar la tabla.

Quedan las 21 tablas originales: `db:check` debe informar **21/21**, además del historial técnico de migraciones. También verifica que no permanezca NUMERACIONUSO.

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
4. Reiniciar/reanudar la aplicación, recargar los formularios y verificar 21/21 tablas. Las versiones que dependen de NUMERACIONUSO no son compatibles con su eliminación; publicar el código y aplicar la migración en la misma ventana sin escritores.

## Cómo probar

1. Revisar los numeradores migrados: mismo correlativo/estado, Código del comprobante anterior y Caja vacía. Consultar movimientos anteriores: sus números permanecen iguales.
2. Crear GENERAL, activo, Próximo número 0001-00000100. En Comprobantes asociarlo a RECIBO y PAGO. Guardar operaciones alternadas: 100, 101, 102. Repetir en dos pestañas con la misma sugerencia: ambos guardados deben obtener números diferentes.
3. Crear CAJA01 asociado a una caja. Usarlo desde un comprobante de Cuenta corriente sin seleccionar caja: debe funcionar automáticamente. En Cobros y pagos/Tesorería elegir la caja correspondiente: automático; elegir otra: cero, aviso y entrada manual habilitada, sin avanzar CAJA01.
4. Probar un comprobante sin numerador y otro cuyo numerador esté inactivo: aviso y carga manual. No se debe guardar un cero manual ni repetir número del mismo comprobante.
5. Asociar un numerador nuevo con un próximo número inferior a los movimientos históricos: debe guardar la asociación y mostrar esa sugerencia exacta. Probar una edición manual menor, mayor y de otro punto y verificar las reglas de avance. La consulta de movimientos guardados permanece de solo lectura. Un número repetido del mismo comprobante se rechaza al confirmar, sin avanzar el numerador; no impide configurar la asociación.
6. Anular una operación: el próximo número no retrocede. Un numerador asociado no se elimina; al quitar todas las asociaciones, sí se puede eliminar aunque haya emitido antes. Consultar los movimientos anteriores: sus números permanecen iguales. Probar error de guardado y reintento: no debe avanzar el próximo número ni duplicar el movimiento.
7. Configurar una reversión con numerador por caja: caja incompatible impide confirmarla; otra apertura de la misma caja continúa la secuencia correctamente. Solo Motivo sigue siendo editable.
8. En Comprobantes revisar Datos generales (Código/Activo, Descripción, Módulo, Orden) y Opciones (Numerador, Cuenta, Naturaleza, Sentido, Exclusivo y Reversión). Probar navegación, sticky y móvil. En filtros debe aparecer Módulo de origen, sin filtro de reversión.
