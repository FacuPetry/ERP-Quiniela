# Biblioteca de controles base

Los ocho ABM actuales (Tipos de cliente, Clientes, Conceptos, Cajas, Bancos, Cuentas bancarias, Comprobantes y Numerador) utilizan los mismos controles mediante `MasterForm`. `FilterDialog` también utiliza TextBox y DropDown. No existen variantes de estos controles por tabla.

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

MasterForm agrupa Código y Registro activo en la fila superior y enfoca Código al abrir un alta, modificación o consulta. El orden de Tab sigue la disposición visual. Ver [apertura y navegación de los ABM](navegacion-abm.md), incluida la carga manual de listados.

Los controles reciben `label`, `id` opcional, `value`, `onValueChange`, `required`, `disabled`, `invalid`, `error`, `hint`, `wide` y `size` opcional. Si no se proporciona `id`, Field genera uno; los ABM conservan sus identificadores para enfocar el primer campo incorrecto. `wide` ocupa las dos columnas del formulario en escritorio y una en móvil.

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

Cada módulo entrega sus opciones permitidas o configura el adaptador con los filtros que soporta su API. El control visual no determina las reglas del comprobante.

## CheckBox

Se conserva un `input type="checkbox"` real. Clic sobre la casilla o su label cambia el mismo valor; Tab y espacio funcionan de forma nativa. Los colores de hover, foco y selección son verdes. La consulta sin permisos de edición mantiene el control deshabilitado. En modo de colores forzados se utiliza la apariencia nativa para conservar el contraste.

## Cómo probar progresivamente

1. **TextBox:** abrir altas y modificaciones en los seis maestros. Comprobar labels arriba, campos obligatorios, límites de caracteres, email inválido y foco en el primer error. Cancelar debe descartar cambios; Guardar debe volver al listado actualizado sin recargar la página ni mostrar un aviso de éxito.
2. **TextArea:** en Clientes, escribir varias líneas en Observaciones. Debe conservar su altura, mostrar scroll interno y persistir el texto al guardar y volver a editar.
3. **DropDown:** en Clientes y Cuentas bancarias, elegir un tipo o banco activo por clic y teclado. Comprobar estilo y marca de selección, ausencia de buscador e inactivos y opciones completas cuando existan más de cien. Abrir Filtrar y repetir allí; probar Escape, Limpiar, Cancelar y Aplicar.
4. **CheckBox:** alternar Registro activo con la casilla, con su label y con espacio. Guardar, volver a editar y comprobar el estado. Probar también con un perfil de consulta: Código es enfocable y de solo lectura; los demás controles están deshabilitados.
5. Revisar los mismos formularios y desplegables en escritorio y móvil, incluyendo una pantalla de 320 px.

Durante esta entrega pasaron `npm run check` (TypeScript, las 18 pruebas existentes y build de producción) y pruebas en Chromium contra una MariaDB 11.8.9 aislada: los seis ABM, validaciones, persistencia, opciones activas en varias páginas, referencia histórica, selección por teclado/clic, scroll y selección táctiles, filtros en modal, CheckBox y vistas de 320/375/768/1280 px. No se accedió a la base de Hostinger.

## Publicación y próximos componentes

Los controles originales no requieren migraciones por sí mismos. La revisión actual de NumeroComprobante sí requiere una migración de datos y estructura: ver [guía](numeracion-comprobantes.md). No agrega dependencias ni variables.

SF se implementa en la [etapa 5](etapa-5.md#sf-reutilizable). DatePicker y AmountBox ya están disponibles: ver [formatos, contratos y pruebas](controles-fechas-importes.md). Los próximos controles compartirán Field y los mismos estilos; las búsquedas del SF reciben su fuente y configuración desde el módulo.

## Identificadores internos en los ABM

Los formularios y grillas compartidos excluyen IDTabla mediante masterFormFields y masterListColumns. La PK se conserva en el estado y en las solicitudes de modificación, sin crear un campo oculto de formulario ni exponerla en los textos de selección o eliminación. Codigo conserva su presentación y funcionamiento. En Numerador el primer campo visible es Comprobante; el foco inicial espera su carga sin quitarle el foco al usuario si ya comenzó a navegar. Los módulos con formularios propios también deben mantener IDTabla exclusivamente interno.

## SearchField / SF

SearchField recibe datos y funciones por propiedades; no conoce entidades ni APIs. ClientSearch adapta la búsqueda existente de Clientes. La búsqueda solo se ejecuta con Enter o lupa, selecciona una coincidencia o abre Modal/DataTable/Pagination para varias. Los criterios y paginación se envían al servidor, sin descargar todos los clientes. Editar el criterio invalida el registro seleccionado y las respuestas anteriores se cancelan. Ver [configuración y pruebas](etapa-5.md#sf-reutilizable).

## NumeroComprobante

Control genérico en `controls/NumeroComprobante.tsx`, con Field y estilos propios en `numero-comprobante.css`, utilizado por MasterForm para el Próximo número de Numerador y por Cuenta corriente. Recibe `value` decimal codificado, `onValueChange`, label, ayuda, errores, required, disabled y readOnly. No consulta la base ni decide numeración o duplicados.

Dos inputs contiguos de cuatro y ocho dígitos, sin guion en el editor y con un divisor vertical fino, comparten borde y foco. El ancho se ajusta a sus dígitos; los listados conservan el formato con guion. Inicialmente muestra ceros; al salir de cada parte completa sus ceros. Tab navega entre las partes; pegar `0001-00000025` actualiza ambas. Conserva estados intermedios de edición sin redondear números y sincroniza sugerencias externas al cambiar de comprobante. El formulario y la API validan los límites y el correlativo positivo. Ver [reglas y pruebas](numeracion-comprobantes.md).

## Anchos configurables

Field centraliza `size?: "sm" | "md" | "lg" | "xl"`. Los máximos son 12, 20, 32 y 48 rem respectivamente. Siempre se ajustan al ancho disponible; no crean desplazamiento horizontal ni cambian la altura del control. Sin size se conserva el ancho actual. `wide` indica cuántas columnas ocupa el campo y `size` limita su ancho dentro de ese espacio.

La propiedad llega a TextBox, TextArea, DropDown, CheckBox, NumeroComprobante y SearchField. ReferenceSelect la propaga a DropDown. En los ABM declarativos se configura `size` en MasterField y MasterForm lo transmite, sin crear componentes por módulo. DatePicker y AmountBox también admiten size y reutilizan Field.

SF muestra `código - descripción` dentro del input; getDescription debe devolver solo la descripción. Conserva por separado el registro T seleccionado. Limpiar elimina texto y selección, aborta búsquedas y devuelve el foco. Cero coincidencias resalta en rojo claro y se anuncia por texto/ARIA, sin depender solamente del color. Editar el criterio invalida la selección y las filas del resultado anterior hasta buscar otra vez. El consumidor valida el registro seleccionado, nunca da por válido el texto escrito. Ver [pruebas](cuenta-corriente-presentacion-sf.md).

## DatePicker y AmountBox

DatePicker combina escritura manual normalizada a dd/MM/yyyy con un calendario nativo disponible mediante el icono adyacente. Emite yyyy-MM-dd o vacío, sin Date ni conversiones de zona horaria sobre la fecha ingresada. Se utiliza en Cuenta corriente, sus filtros y FilterDialog.

AmountBox conserva decimales como strings con punto, sin miles/símbolos ni paso por Number. Formato predeterminado `#,##0.00`, locale es-AR; format permite variar agrupación y decimales. Al salir se presenta con miles y coma decimal. No redondea precisión excedente: informa el error y no entrega un valor válido. Las restricciones comerciales siguen perteneciendo al formulario/API. El Importe de Cuenta corriente lo utiliza con hasta 16 enteros y dos decimales. Ver [guía](controles-fechas-importes.md).

## Foco compartido y Safari móvil

SF, DatePicker y NumeroComprobante comparten la clase control-group de controls.css: borde exterior único, contorno verde semitransparente de 2px y esquinas comunes. No se dibujan anillos individuales superpuestos dentro del grupo. Los botones mantienen una señal interna al recibir foco por teclado; los estados de error y alto contraste se conservan. TextBox, TextArea, DropDown y CheckBox usan el mismo contorno discreto.

En ancho <=860px o con cualquier puntero táctil, las fuentes de entrada son al menos 16px y la altura común es 44px. Incluye inputs internos, filtros y acceso. Escritorio conserva 12px/40px. No se modifica el viewport ni se limita el zoom del usuario. Ver [verificación en Safari iPhone](foco-controles-safari.md).

## Valores iniciales

TextBox de type number y AmountBox permiten omitir value (o usar undefined) para inicializar desde initialValue, que por defecto es "0". La sugerencia se emite una sola vez para sincronizar el modelo. Un value explícito tiene prioridad: "" representa un campo limpiado y nunca se repone con cero, y los valores de edición se conservan. AmountBox muestra el cero con la máscara configurada (0,00, 0,000, etc.). En formularios controlados también se puede inicializar el estado con defaultNumericValue.

MasterForm utiliza initialMasterFieldValue al crear registros: enteros a cero, excepto PK generadas; field.defaultValue tiene prioridad (incluida cadena vacía). Editar utiliza el registro existente, sin ejecutar estas sugerencias. Los códigos de clientes y los ID autogenerados conservan sus mecanismos.

SearchField recibe placeholder opcional y utiliza por defecto «Ingrese un valor para buscar...», también en el selector. ClientSearch lo propaga para personalización por módulo.

initialListFilters permite inicializar fechas al entrar al módulo y Confirmado para operaciones. La limpieza se configura por separado, sin reintroducir valores al abrir el modal ni disparar consultas. Ver [guía](valores-iniciales-abm.md).
