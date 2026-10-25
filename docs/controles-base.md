# Biblioteca de controles base

Los seis ABM actuales (Tipos de cliente, Clientes, Conceptos, Cajas, Bancos y Cuentas bancarias) utilizan los mismos controles mediante `MasterForm`. `FilterDialog` también utiliza TextBox y DropDown. No existen variantes de estos controles por tabla.

## Organización y responsabilidades

| Archivo                                      | Responsabilidad                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/controls/Field.tsx` | Label, identificador, marca de obligatorio, ayuda, error y asociaciones de accesibilidad comunes.                |
| `TextBox.tsx`                                | Input controlado de una línea. Conserva tipos nativos, límite de caracteres, foco, deshabilitado y solo lectura. |
| `TextArea.tsx`                               | Texto multilínea con altura configurable, scroll interno y sin redimensionamiento manual.                        |
| `DropDown.tsx`                               | Selección visual y por teclado sobre opciones recibidas por propiedades.                                         |
| `CheckBox.tsx`                               | Valor booleano con casilla nativa, label clickeable y presentación personalizada.                                |
| `index.ts`                                   | Exportaciones de la biblioteca; los formularios importan desde `components/controls`.                            |
| `apps/web/src/controls.css`                  | Colores, dimensiones, bordes, foco y estados de los controles.                                                   |
| `components/masters/ReferenceSelect.tsx`     | Adaptador existente de referencias: consulta opciones activas y las entrega al DropDown.                         |

Los labels permanecen arriba para conservar la distribución actual en escritorio y móvil. El CheckBox conserva su label al lado. Los controles no consultan tablas ni conocen clientes, bancos o comprobantes.

Todos reciben `label`, `id` opcional, `value`, `onValueChange`, `required`, `disabled`, `invalid`, `error`, `hint` y `wide`. Si no se proporciona `id`, Field genera uno; los ABM conservan sus identificadores para enfocar el primer campo incorrecto. `wide` ocupa las dos columnas del formulario en escritorio y una en móvil.

TextBox y TextArea admiten las propiedades nativas correspondientes, como `name`, `maxLength` y `ref`; TextBox también admite `type` y `readOnly`. No se utilizan para definir reglas de negocio: MasterForm mantiene sus validaciones actuales y la API conserva las suyas. La presentación de errores sigue siendo inline y mediante el resumen existente.

## TextBox y TextArea

Los dos comparten Field y los estilos de `base-control`. TextArea es un componente independiente para mantener las propiedades y semántica nativas de `textarea`, sin duplicar labels, ayuda ni errores. Su altura predeterminada es 96 px, configurable mediante `height`; también admite `rows`. Cuando el contenido supera la altura, aparece el scroll vertical. El usuario no puede arrastrar el borde.

Los campos de código conservan su comportamiento: solo lectura al editar y sugerencia de cinco dígitos al crear clientes. Esta entrega no cambia la asignación definitiva ni su control de concurrencia.

## DropDown y referencias

DropDown recibe `options` con `{ value, label, disabled?, hidden? }`. Los valores son strings y deben ser únicos. La entidad que lo utiliza adapta sus registros y aplica sus filtros antes de entregar las opciones. No hay buscador interno. `placeholder`, `loading` y `name` permiten configurar la presentación, la carga y el envío mediante FormData cuando se requiera.

La lista tiene bordes redondeados, estados verdes y un tilde en la opción seleccionada. Al abrirla:

- Flechas recorren opciones habilitadas; Inicio/Fin van a los extremos.
- Enter o espacio seleccionan; Escape cierra; Tab continúa al siguiente control.
- Escribir caracteres permite saltar por el comienzo del texto de las opciones, sin mostrar un textbox adicional.
- Clic fuera del desplegable lo cierra. Dentro de un modal, el primer Escape cierra el desplegable y el siguiente puede cerrar el modal.

Se conserva el foco en el control y se informa la opción activa mediante ARIA. La lista se coloca arriba o abajo según el espacio disponible; dentro de un diálogo permanece en ese diálogo para evitar que quede detrás de la ventana o fuera de su área interactiva.

ReferenceSelect conserva la carga de todas las páginas, `query`, `optionFilter`, el tratamiento de sesión vencida y la acción de reintentar. Solo ofrece referencias activas. Una referencia histórica inactiva o fuera del contexto se muestra como valor actual, pero no se ofrece para elegirla de nuevo. DropDown no decide estas reglas.

Para un futuro comprobante, el módulo entregará sus opciones permitidas o configurará el adaptador con los filtros que soporte su API. No se agrega todavía ese ABM ni se asumen reglas de sus comprobantes.

## CheckBox

Se conserva un `input type="checkbox"` real. Clic sobre la casilla o su label cambia el mismo valor; Tab y espacio funcionan de forma nativa. Los colores de hover, foco y selección son verdes. La consulta sin permisos de edición mantiene el control deshabilitado. En modo de colores forzados se utiliza la apariencia nativa para conservar el contraste.

## Cómo probar progresivamente

1. **TextBox:** abrir altas y modificaciones en los seis maestros. Comprobar labels arriba, campos obligatorios, límites de caracteres, email inválido y foco en el primer error. Cancelar debe descartar cambios; Guardar debe volver al listado actualizado sin recargar la página ni mostrar un aviso de éxito.
2. **TextArea:** en Clientes, escribir varias líneas en Observaciones. Debe conservar su altura, mostrar scroll interno y persistir el texto al guardar y volver a editar.
3. **DropDown:** en Clientes y Cuentas bancarias, elegir un tipo o banco activo por clic y teclado. Comprobar estilo y marca de selección, ausencia de buscador e inactivos y opciones completas cuando existan más de cien. Abrir Filtrar y repetir allí; probar Escape, Limpiar, Cancelar y Aplicar.
4. **CheckBox:** alternar Registro activo con la casilla, con su label y con espacio. Guardar, volver a editar y comprobar el estado. Probar también con un perfil de consulta: los controles deben estar deshabilitados.
5. Revisar los mismos formularios y desplegables en escritorio y móvil, incluyendo una pantalla de 320 px.

Durante esta entrega pasaron `npm run check` (TypeScript, las 18 pruebas existentes y build de producción) y pruebas en Chromium contra una MariaDB 11.8.9 aislada: los seis ABM, validaciones, persistencia, opciones activas en varias páginas, referencia histórica, selección por teclado/clic, scroll y selección táctiles, filtros en modal, CheckBox y vistas de 320/375/768/1280 px. No se accedió a la base de Hostinger.

## Publicación y próximos componentes

Incorporar el PR a `main` y desplegar en Hostinger con la configuración actual. Esta entrega no requiere migraciones, variables nuevas ni instalar dependencias adicionales.

DatePicker y SF siguen pendientes de definir e implementar. El campo nativo de fecha que admite FilterDialog sigue disponible mediante Field; no se lo presenta como un DatePicker nuevo. Los próximos controles compartirán Field y los mismos estilos; las búsquedas del SF deberán recibir su fuente de datos y configuración desde el módulo.
