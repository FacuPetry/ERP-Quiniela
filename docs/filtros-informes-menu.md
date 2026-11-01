# Filtros compartidos, base de Informes y navegación por categorías

Entrega de interfaz posterior a Usuarios y al primer Resumen de Cuenta corriente. No requiere migraciones, dependencias nuevas ni cambios de permisos, consultas financieras o importes.

## Usuarios: mismo filtro que los demás ABM

El toolbar incorpora el ícono estándar Filtrar y abre **FilterDialog**, con Búsqueda (nombre/correo) y Estado. Ya no hay filtros particulares debajo de la tabla.

- El listado empieza sin consultar.
- Aplicar filtros guarda los criterios, vuelve a la primera página y consulta.
- Limpiar prepara los valores vacíos/Todos dentro del modal, sin consultar hasta Aplicar.
- Cancelar, Cerrar o Escape descartan los cambios del modal y conservan los filtros/resultados aceptados anteriormente.
- Actualizar sigue utilizando los criterios aplicados; el ícono indica cuando hay filtros activos.

## Base reutilizable de Informes

`apps/web/src/components/reports/ReportView.tsx` centraliza presentación y ciclo de consulta. El módulo aporta filtros iniciales, editor de filtros, validación opcional, una función de carga estable, columnas, clave/etiqueta de fila, Propiedades y bloques opcionales de resumen/notas.

La base compone **Modal, ActionToolbar, DataTable, Pagination y useListSorting**. No incorpora otro componente de listas ni interpreta reglas financieras.

### Ciclo de consulta

1. Al montar el informe, abre automáticamente **Filtros del informe**, sin consultar resultados.
2. Aceptar valida los filtros, vuelve a la primera página y ejecuta la consulta.
3. Cancelar/Cerrar/Escape antes de la primera consulta deja el informe vacío, con el mensaje «Aplicá los filtros para consultar la información».
4. Filtros del informe vuelve a abrir el editor con la última selección aceptada. Cancelar una edición posterior conserva los resultados y criterios de esa consulta, sin ejecutar otra.
5. Actualizar informe repite la consulta aceptada. Si todavía no se aceptaron filtros, abre el modal; no consulta todos los registros automáticamente.
6. Ordenar cambia el criterio remoto y vuelve a la primera página. La paginación conserva los filtros. Al salir del informe se cancela la petición pendiente; al entrar nuevamente comienza un ciclo vacío con filtros abiertos.

Los errores de consulta no se presentan como saldos cero ni conservan resultados que parezcan pertenecer al filtro nuevo. Los totales y la cantidad siguen viniendo de la misma respuesta del servidor.

### Presentación

La base define el estilo de informes en `reports.css`: tabla sin líneas divisorias entre filas/columnas, encabezados limpios, importes alineados a la derecha y tarjetas de resumen responsive. Se conservan selección, orden, scroll horizontal y Propiedades.

El estilo está limitado a `.report-results`; las listas de ABM y las búsquedas SF conservan su apariencia. DataTable incorpora `TableColumn.align` opcional para alinear también el encabezado; omitirlo conserva el comportamiento de las otras grillas.

### Cliente mediante SF

Resumen de Cuenta corriente reutiliza **ClientSearch/SearchField**, con registros activos e históricos, búsqueda por lupa, selección automática cuando hay una coincidencia o modal cuando hay varias, y Limpiar. El filtro envía **Cliente = código seleccionado** a la API existente, sin convertir el texto escrito en un cliente válido.

Sin cliente seleccionado y con el campo limpio se consultan todos los clientes con movimientos confirmados. Si hay texto sin una selección validada, Aceptar indica que debe utilizarse la lupa o limpiarse el campo. SearchField expone un callback opcional `onSearchTextChange` para esta validación; no cambia su funcionamiento en los demás módulos.

Se mantienen los saldos actuales, las reglas de créditos/afectaciones/anulaciones/reversiones y el alcance sin corte histórico ni exportaciones.

### Reutilización

Un próximo informe debe componer ReportView con sus propios tipos, columnas y filtros. La función `load` debe declararse fuera del render o mantenerse estable con useCallback para que un cambio de identidad no provoque otra consulta. Sus resultados cumplen `ReportResult<T>` (registros, total, pagina y limite); puede extenderlo con totales u otra información.

El editor recibe `{ value, onChange }`, utilizando controles base. Para actualizar varias partes desde eventos del mismo control, utilizar actualizaciones funcionales de onChange. La validación y el envío de identificadores corresponden al módulo; la base administra cuándo consultar, sin definir cómo se calculan los datos.

## Menú lateral

`SidebarNavigation.tsx` presenta Inicio y las categorías **Operaciones, Maestros, Informes y Sistema**. Cada categoría se expande/contrae con un botón nativo y puede abrirse independientemente de las otras. Todas comienzan contraídas al iniciar sesión; su apertura se conserva durante la navegación de esa sesión, sin persistirse entre ingresos.

Workspace entrega únicamente las opciones autorizadas por los permisos existentes. Una categoría vacía no se muestra. Mi cuenta continúa disponible para todos los usuarios, por lo que Sistema puede contener solamente esa opción. Usuarios sigue reservado al administrador.

Los enlaces conservan sus URLs y navegación habitual. El seleccionado mantiene fondo/aria-current al mostrarse; la categoría que lo contiene se distingue también al contraerse. Los botones tienen aria-expanded y aria-controls, y admiten Enter/Espacio. Se conservan el cierre móvil por Escape y el control de foco del drawer.

Las etiquetas usan `min-width: 0`, espacio flexible, overflow y text-overflow: ellipsis: el recorte depende del ancho real, no de la cantidad de caracteres. El enlace conserva el texto completo y su atributo title para el tooltip, también con el sidebar compacto. No se aumentan los anchos existentes: 244 px expandido, 76 px compacto y 260 px en el drawer móvil.

## Archivos afectados

- Usuarios: `components/users/UsersPage.tsx` y `users.css`.
- Informes: nuevo `components/reports/ReportView.tsx`, adaptación de `AccountSummaryPage.tsx` y `reports.css`.
- Controles reutilizables: `controls/SearchField.tsx`, `current-account/ClientSearch.tsx`, `ui/DataTable.tsx` y `masters.css`.
- Menú: nuevo `components/SidebarNavigation.tsx`, `Workspace.tsx`, `Icon.tsx` y `styles.css`.
- Documentación: README, esta guía, la guía de Usuarios/Resumen y el registro de entregas/pendientes.

Las rutas de componentes/estilos se encuentran dentro de `apps/web/src`. No se modifican `apps/api`, las migraciones ni los contratos financieros.

## Cómo probar

1. Entrar a Usuarios: no debe consultar ni mostrar filtros debajo de la tabla. Abrir Filtrar, cambiar búsqueda/estado y Cancelar: sin consulta. Reabrir, aplicar y comprobar resultados; probar Limpiar/Cancelar y Limpiar/Aplicar, orden y paginación.
2. Entrar al Resumen desde el menú: los filtros deben abrirse automáticamente y la red no debe registrar una petición al informe. Cancelar, cerrar con X o Escape: queda vacío. Actualizar antes de aceptar también debe abrir filtros sin consultar.
3. Escribir un cliente y presionar Aceptar sin buscar: debe mantener el modal y pedir selección. Buscar una coincidencia única; después probar varias y seleccionar desde el SF. Hasta Aceptar no debe consultarse el informe.
4. Aceptar un cliente y verificar que se consulta solo su código; probar Limpiar/Aceptar para todos. Revisar tarjetas, alineación, ausencia de divisorias, totales, orden, paginación y Propiedades.
5. Con resultados, abrir filtros, cambiar cliente y Cancelar: conserva la consulta anterior. Salir a Inicio y volver: inicia vacío con los filtros abiertos.
6. En una sesión nueva, comprobar las cuatro categorías contraídas. Expandir/contraer con clic y teclado, navegar y revisar el seleccionado. Probar un usuario limitado: no deben mostrarse opciones ni categorías sin accesos.
7. Revisar nombres largos, tooltip, sidebar compacto y drawer móvil. No debe crecer el ancho ni cortarse el fondo de selección. Las tablas deben seguir desplazándose dentro de su área, sin ensanchar la página.

Verificación de desarrollo: comprobación de tipos y revisión Chromium con API simulada para estos flujos, incluidos modales anidados del SF, cancelaciones sin consultas, alineación y menús de 244/76/260 px. No se ejecutan compilación de producción, migraciones ni pruebas financieras para esta entrega de interfaz. Safari/iPhone real queda para la aceptación del cliente.
