# Etapa 4: Comprobantes y Numerador

Dos ABM independientes en Maestros, sobre las tablas existentes COMPROBANTE y NUMERACION. No se agregan tablas, migraciones, dependencias ni variables de entorno. No se cargan ejemplos en la base del negocio.

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
| IDTabla | PK automática exclusivamente interna; no se muestra en formularios, grillas ni confirmaciones |
| Comprobante | FK a COMPROBANTE.Codigo; selector de comprobantes activos |
| Serie | Nombre de la serie, obligatorio, hasta 10 caracteres |
| ProximoNumero | Entero positivo; el alta propone 1 |
| Activo | Estado de la serie |

Se admiten varias series por comprobante. La combinación Comprobante–Serie es única, incluso ante altas simultáneas. Se utiliza el índice existente, con mensaje específico ante duplicados. En la grilla se muestra la descripción actual del comprobante sin copiarla a NUMERACION; la FK sigue siendo su código. Una referencia que después se desactiva puede conservarse en una serie existente.

Guardar o consultar esta configuración no consume números. Una serie sin movimientos puede cambiar su comprobante, nombre o próximo número, o eliminarse. Cuando está utilizada:

- Comprobante y Serie se muestran bloqueados. La API también impide cambiarlos, aunque el uso haya comenzado después de abrir el formulario.
- ProximoNumero debe superar el máximo de CUENTACORRIENTE y CAJAMOVIMIENTO que referencian esa numeración, incluidos los anulados.
- No se permite eliminarla; puede desactivarse, manteniendo un próximo número válido.
- Una referencia con número NULL también se considera uso a efectos de conservar la identidad.

La modificación bloquea la fila de NUMERACION dentro de la transacción y verifica la versión del registro, el uso y las referencias. La auditoría pertenece a la misma transacción. Los BIGINT se transmiten como texto decimal y se comparan con BigInt, sin convertirlos en Number; el límite es 9223372036854775807, según la columna existente. No se aplica el formato de cinco dígitos de CLIENTE a los números de comprobantes ni a IDTabla.

La emisión de Cuenta corriente se incorpora en la [etapa 5](etapa-5.md), con Numerador opcional y bloqueo/actualización dentro de la transacción de confirmación. Las demás operaciones financieras siguen pendientes. No utilizar un MAX sin bloqueo ni reservar números al abrir formularios.

## Interfaz y API compartidas

IDTabla permanece en el contrato de la API y en la persistencia, pero se excluye de la presentación desde la base compartida de formularios y grillas. Las etiquetas de selección y la confirmación de baja usan datos legibles del registro. Codigo sigue visible en los maestros que lo utilizan. El menú y el título del módulo muestran Numerador; la tabla y las rutas no cambian.

Ambos módulos reutilizan MasterPage, MasterForm, DataTable, filtros, paginación y los controles visuales existentes. Se extendió la configuración del ABM para admitir listas de opciones, enteros y PK IDTabla; no se rediseñaron los controles. Se conservan carga manual, selección, doble clic, foco inicial, orden de teclado, estado junto a la identidad y ausencia de mensajes de éxito.

API: `/api/maestros/comprobantes` y `/api/maestros/numeraciones`, con los mismos métodos y filtros `q`, `estado`, `pagina` y `limite` de los demás maestros. Numeraciones también acepta `referencia` con el código del comprobante. Los detalles y escrituras de numeraciones usan IDTabla en la URL y en el cuerpo de modificación; no incorporan un campo Codigo ficticio. Los detalles de series utilizadas agregan `camposSoloLectura` sin modificar los datos almacenados ni su versión.

Todos los usuarios activos pueden consultar. ADMIN puede escribir con CSRF y versión If-Match, manteniendo los permisos existentes. SF se incorpora en la etapa 5; DatePicker sigue pendiente.

## Cómo probar

1. En Maestros → Comprobantes, comprobar que la grilla comienza vacía. Usar Agregar para crear un comprobante con las opciones de la tabla anterior. Guardar vuelve al listado sin consultar si aún no se solicitó la grilla.
2. Presionar Actualizar: deben mostrarse las etiquetas de los enums. Hacer doble clic y modificar la descripción. Verificar filtros, estado y conservación del código.
3. En Maestros → Numerador, agregar una serie A asociada al comprobante. El formulario debe comenzar en Comprobante, sin campo Identificador ni IDTabla; Próximo número debe proponer 1. Para usar la serie en Cuenta corriente, utilizar una serie numérica, por ejemplo 0001.
4. Guardar y actualizar. Debe aparecer la descripción del comprobante. Volver a abrir: el próximo número sigue en 1. Crear la serie B del mismo comprobante; intentar repetir A debe informar el duplicado sin guardar.
5. Modificar el próximo número de una serie sin movimientos, desactivarla y consultar el filtro de inactivos. Se puede eliminar una serie sin referencias. Intentar eliminar su comprobante mientras conserve series debe explicar que está utilizado.
6. Revisar los ABM anteriores: carga manual, alta de clientes, referencias, edición y navegación siguen disponibles.

Las restricciones de series utilizadas se verifican con fixtures aislados, porque todavía no hay pantallas de emisión. No insertar movimientos manuales en producción para probarlas.

## Publicación

Fusionar el PR a main y desplegar en Hostinger con la configuración vigente. No hay migraciones nuevas ni hay que volver a crear la cuenta administradora o modificar variables de entorno. Los maestros y datos existentes se conservan.

## Verificación

- `NODE_ENV=production npm run check`: tipos, pruebas unitarias/HTTP y compilación.
- `npm run test:integration`: MySQL 8.4 aislado.
- `npm run test:integration:mariadb`: MariaDB 11.8.9 aislado.
- Navegador Chromium: altas, edición, duplicados, etiquetas, referencias activas e históricas, BIGINT exactos, restricciones de series utilizadas, carga manual, permisos, navegación de los maestros anteriores y adaptación móvil.

Resultado: pasaron las 22 comprobaciones unitarias/HTTP y las 28 de integración por cada motor (78 contando las pruebas contenedoras del runner), además de tipos y compilación. Chromium verificó los dos módulos y la regresión de Clientes y Cuentas bancarias; vistas de 320, 375, 768 y 1280 píxeles sin desbordamiento de página ni errores de JavaScript. Todas las bases utilizadas fueron efímeras; no se accedió a Hostinger.

## Próxima etapa

Cuenta corriente, incorporando SF para seleccionar clientes y definiendo el circuito de registro de obligaciones y créditos con los comprobantes configurados. Cobros/pagos y la emisión segura de números se desarrollarán junto con las operaciones correspondientes.
