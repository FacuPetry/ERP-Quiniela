# OffCanvas y Propiedades

## Uso en los listados

Disponible en Tipos de cliente, Clientes, Conceptos, Cajas, Bancos, Cuentas bancarias, Comprobantes, Numerador y Cuenta corriente.

1. Entrar al módulo. El listado continúa vacío hasta solicitar Filtrar o Actualizar listado.
2. Seleccionar una fila y presionar el ícono **Propiedades** (documento) del toolbar. Sin selección está deshabilitado.
3. Consultar los datos en el panel derecho. Las referencias muestran descripciones, también si el registro relacionado está inactivo. IDTabla y los identificadores internos no se presentan.
4. Cerrar mediante Cerrar, la cruz, Escape o un clic en el fondo exterior. Se conserva la selección y los filtros, sin recargar la grilla. El foco vuelve al botón de apertura.

Propiedades es de solo lectura, también disponible para usuarios con permiso de consulta. Las acciones existentes de modificar, consultar, anular y doble clic conservan su funcionamiento. En Cuenta corriente se muestra el estado y, para anulados, su fecha y motivo.

La consulta de detalle se hace únicamente al abrir. En maestros se obtiene además cada referencia concreta necesaria, sin descargar catálogos completos ni consultar por cada fila de la grilla. Al cerrar se cancela la solicitud pendiente. Los fallos muestran Reintentar; una sesión vencida utiliza el manejo de acceso existente.

## Base reutilizable

`apps/web/src/components/ui/OffCanvas.tsx` es el contenedor visual. Recibe:

| Propiedad | Uso |
| --- | --- |
| `open`, `onClose` | Estado controlado por el módulo. |
| `title` | Título visible y nombre accesible. |
| `children` | Contenido libre: propiedades, formularios o listados. |
| `side` | `right` predeterminado o `left`. |
| `size` | `sm`, `md` predeterminado, `lg` o `xl`. En móvil ocupa todo el ancho. |
| `footer` | Acciones propias; por defecto Cerrar a la derecha. `null` oculta el pie. |
| `busy` | Impide cerrar durante una confirmación; no se usa para bloquear una lectura pendiente. Las acciones personalizadas deben aplicar sus propios estados disabled. |
| `closeOnBackdrop` | Cierre al pulsar fuera del panel; predeterminado `true`. |

Utiliza un portal al body y el diálogo nativo de Modal para superponerse sin desplazar el contenido, mantener el foco dentro y bloquear la interacción con el fondo. El cuerpo tiene scroll propio; cabecera y pie permanecen visibles. Se bloquea el scroll exterior conservando el espacio de la barra y se restauran estilos/foco al cerrar. Respeta movimiento reducido y no limita el zoom. Modal conserva sus opciones anteriores por defecto; Escape no se propaga a otro diálogo que lo contenga.

`RecordProperties<T>` adapta el contenedor a consultas de lectura mediante `loadRecord(signal)` y una lista de `PropertyField<T>` con `key`, `label`, `render` y `visible` opcional. El callback de carga debe ser estable (useCallback). No se vuelca automáticamente el objeto recibido: cada módulo define los campos públicos que desea mostrar.

Los maestros comparten `MasterProperties` y `master-properties.ts`, aprovechando los campos funcionales ya definidos. `MasterDefinition.propertyFields` permite elegir campos y orden por módulo; si se omite, muestra los campos funcionales y Estado. Los campos internos se excluyen incluso si se intenta configurarlos. Cuenta corriente aporta su propia configuración en `CurrentAccountProperties.tsx` y reutiliza los formatos existentes de fechas, importes y comprobantes.

Los próximos ABM basados en MasterPage heredan Propiedades. Los módulos con pantallas propias pueden conectar `ActionToolbar.onProperties` con RecordProperties o utilizar OffCanvas directamente para otros contenidos. El contenedor no conoce entidades ni reglas financieras. Las afectaciones de Caja movimiento, su selección múltiple y los importes parciales siguen pendientes para esa etapa; podrán aportar contenido y acciones al mismo OffCanvas.

## Verificación

- `npm run check`: tipos, pruebas y compilación. `tests/record-properties.test.ts` comprueba configuración, exclusión de IDTabla, formatos, carga acotada de referencias y errores.
- Comprobar Clientes con observaciones y un tipo inactivo, y Cuentas bancarias con un banco inactivo: deben verse sus descripciones actuales.
- En Cuenta corriente comprobar un confirmado y un anulado, incluyendo importe, número completo y motivo de anulación.
- Probar Tab/Shift+Tab, Escape y retorno del foco; el fondo debe permanecer inmóvil e inaccesible mientras el panel está abierto.
- En móvil comprobar ancho completo, scroll interior y botones de cierre. El texto de las propiedades puede seleccionarse y copiarse.
- En Red/Network comprobar que entrar al módulo no carga registros y que abrir/cerrar Propiedades no recarga la lista.

No hay migraciones, dependencias nuevas ni cambios de reglas de negocio para esta funcionalidad.
