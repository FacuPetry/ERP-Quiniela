# Etapa 4: Comprobantes y Numerador

Dos ABM independientes en Maestros, sobre COMPROBANTE y NUMERACION. La revisión actual incorpora la migración `0002_numero_comprobante_completo`: aplicar el [procedimiento de actualización](numeracion-comprobantes.md) antes de probarla. No agrega tablas, dependencias ni variables de entorno ni carga ejemplos en la base del negocio.

## Comprobantes

Permite consultar, crear, modificar, activar/desactivar y eliminar comprobantes sin referencias. Su código se conserva después del alta. Es un maestro de configuración; guardarlo no registra movimientos ni genera obligaciones o pagos.

| Campo | Presentación y alcance |
|---|---|
| Codigo | Código elegido por el usuario, hasta 20 caracteres |
| Descripcion | Descripción, hasta 100 caracteres |
| ModuloOrigen | Cuenta corriente, Cobros y pagos, Tesorería o Valores |
| Cuenta | Cobrar, Pagar o No aplica |
| Naturaleza | Deuda, Crédito o No aplica |
| SentidoFondos | Ingreso, Egreso o No aplica |
| Orden | Entero opcional, dentro del rango INT de la tabla |
| Activo | Estado del comprobante |

Deuda aumenta lo pendiente; Crédito lo reduce dentro de Cobrar o Pagar. Sentido de fondos es una configuración independiente: registrar una obligación no implica que haya ingresado o salido dinero.

Los catálogos son enums de TypeScript en `packages/shared/src/comprobantes.ts`. Sus opciones y etiquetas se comparten entre API y frontend; el servidor rechaza valores ajenos al catálogo. Las columnas SQL conservan su tipo VARCHAR: no se convierten en ENUM de MySQL. Una opción nueva se agrega al catálogo compartido y a sus etiquetas, sin modificar la tabla. Una prueba comprueba que las opciones cubran todos los valores del enum. Incorporar un módulo operativo nuevo requerirá además desarrollar su funcionamiento.

ModuloOrigen identifica un módulo de origen por comprobante, según el campo existente. No se introduce una relación múltiple ni otra tabla de tipos. Esta entrega administra los campos independientes; las reglas de las futuras operaciones se implementarán al desarrollar esos módulos.

Ejemplos orientativos para probar, no registros automáticos:

| Código | Descripción | Módulo | Cuenta | Naturaleza | Sentido |
|---|---|---|---|---|---|
| I | Ingreso de jugada | Cuenta corriente | Cobrar | Deuda | No aplica |
| PR | Premio | Cuenta corriente | Pagar | Deuda | No aplica |
| C | Cobro | Cobros y pagos | Cobrar | Crédito | Ingreso |
| P | Pago | Cobros y pagos | Pagar | Crédito | Egreso |

## Numerador

| Campo | Presentación y alcance |
|---|---|
| IDTabla | PK automática interna; no aparece en formularios ni grillas |
| Comprobante | FK a COMPROBANTE.Codigo; un único numerador por comprobante |
| ProximoNumero | BIGINT completo, presentado mediante el control de dos partes `0000-00000000` |
| Activo | Habilita la sugerencia automática |

No existe un campo Serie separado. El control comienza en ceros y exige un correlativo de 1 a 99999999 para guardar. Por ejemplo, `0001-00000025` se almacena como `100000025`. La grilla muestra la descripción del comprobante y el número completo formateado.

Guardar la configuración no consume números. El próximo número de un numerador activo debe superar todos los utilizados en su comprobante y punto de venta, incluidos anulados, tanto en CUENTACORRIENTE como en CAJAMOVIMIENTO. La configuración y la emisión comparten el bloqueo por base, comprobante canónico y punto, además del bloqueo transaccional de la fila.

Los movimientos conservan su propio número completo, sin FK al Numerador. Por eso se puede modificar o eliminar la configuración sin cambiar números históricos. Una configuración inactiva puede conservar el último número agotado; para reactivarla se exige otro número válido y no utilizado. No se cambia de punto de venta automáticamente al agotar ocho cifras.

Los BIGINT viajan como texto decimal y se calculan con BigInt. Ver las reglas completas y la conservación de datos en [Numeración de comprobantes](numeracion-comprobantes.md).

## Interfaz y API compartidas

IDTabla permanece en el contrato de la API y en la persistencia, pero se excluye de la presentación desde la base compartida de formularios y grillas. Las etiquetas de selección y la confirmación de baja usan datos legibles del registro. Codigo sigue visible en los maestros que lo utilizan. El menú y el título del módulo muestran Numerador; la tabla y las rutas no cambian.

Ambos módulos reutilizan MasterPage, MasterForm, DataTable, filtros, paginación y los controles visuales existentes. Se extendió la configuración del ABM para admitir listas de opciones, enteros y PK IDTabla; no se rediseñaron los controles. Se conservan carga manual, selección, doble clic, foco inicial, orden de teclado, estado junto a la identidad y ausencia de mensajes de éxito.

API: `/api/maestros/comprobantes` y `/api/maestros/numeraciones`, con los mismos métodos y filtros `q`, `estado`, `pagina` y `limite` de los demás maestros. Numeraciones también acepta `referencia` con el código del comprobante. Los detalles y escrituras de numeraciones usan IDTabla en la URL y en el cuerpo de modificación; no incorporan un campo Codigo ficticio. El detalle ya no bloquea campos por referencias históricas al Numerador: dichas referencias se eliminan mediante la migración.

Todos los usuarios activos pueden consultar. ADMIN puede escribir con CSRF y versión If-Match, manteniendo los permisos existentes. SF, DatePicker y AmountBox se incorporan con Cuenta corriente; ver [biblioteca](controles-base.md).

## Cómo probar

1. Aplicar primero la migración según la [guía](numeracion-comprobantes.md#actualizar-una-base-existente-en-hostinger).
2. Crear un comprobante y comprobar sus etiquetas, filtros y conservación del código al editarlo.
3. En Numerador agregar una configuración asociada a ese comprobante y completar Próximo número `0001-00000025`. No deben aparecer Serie ni Identificador.
4. Guardar y actualizar manualmente la grilla: se muestran la descripción del comprobante y `0001-00000025`. Intentar crear otro Numerador del mismo comprobante debe informar el duplicado.
5. Verificar la sugerencia automática y el avance al confirmar movimientos en [Cuenta corriente](etapa-5.md#cómo-probar).
6. Modificar el punto del Numerador o eliminarlo y comprobar que los movimientos ya guardados conservan su número. Intentar retroceder un numerador activo a un número ya utilizado en el mismo punto debe impedir el cambio.

## Publicación y verificación

Esta revisión requiere la migración de numeración. No recrear usuarios ni modificar las variables de entorno existentes. Ejecutar tipos, pruebas unitarias/HTTP, integración aislada en MySQL 8.4 y MariaDB 11.8.9 y build. Las pruebas incluyen concurrencia, conservación de registros previos y rechazos de migraciones incompatibles antes de DDL. El recorrido de Chromium verifica ambos ABM y Cuenta corriente con la biblioteca de controles existente.

Cobros/pagos, Tesorería y Valores siguen pendientes.
