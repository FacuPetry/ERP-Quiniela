# Apertura y navegación de los ABM

## Doble clic en una fila

DataTable admite el callback genérico `onRowActivate(row)`. MasterPage lo conecta a la misma función `open("form", row)` que usa el botón Modificar/Consultar, pasando la fila concreta para no depender de que React haya actualizado la selección del primer clic.

La activación se bloquea mientras se carga la grilla o se está abriendo otro registro. Se conserva la consulta de detalle antes de mostrar el formulario y se evita duplicarla ante activaciones simultáneas. Los clics sobre controles interactivos de una celda (enlaces, botones, inputs, labels y contenido editable) no activan la fila.

El perfil ADMIN puede modificar; un perfil de consulta abre Consultar. El doble clic no cambia los permisos. El botón del toolbar y la selección por teclado siguen disponibles.

## Foco inicial, Tab y estado

El hook compartido `useInitialFieldFocus` coloca el foco en el primer control habilitado del formulario al montarse. Incluye los inputs `readOnly`, ignora los ocultos y los deshabilitados y utiliza el título como alternativa cuando no hay controles disponibles. No vuelve a enfocar al escribir, validar ni recibir una sugerencia de código asíncrona.

En los seis maestros actuales, el primer campo es Código:

- En altas con código manual, permite escribirlo.
- En altas de clientes y modificaciones, sigue siendo de solo lectura, pero recibe el foco y participa del recorrido de Tab.
- En Consultar, Código también queda de solo lectura y enfocable; los otros campos y el estado permanecen deshabilitados y no aparece Guardar.
- Mientras se guarda, los controles siguen bloqueados.

MasterForm agrupa el primer campo y el CheckBox de estado en una fila compartida. En escritorio, Registro activo aparece a la derecha de Código y alineado con el input. En pantallas de hasta 600 px, se coloca debajo para mantener campos legibles y evitar desbordes. Los otros campos conservan su orden.

El recorrido utiliza el orden del DOM y no agrega índices Tab positivos. En Clientes es Código → Registro activo → Tipo de cliente → Nombre → resto de campos. Si una referencia todavía está cargando y su control está deshabilitado, Tab lo omite hasta que esté disponible, como sucede con cualquier control deshabilitado. Los errores conservan el foco en el primer campo incorrecto.

Solo existe el estado Activo en los ABM actuales; no se agregan campos Visible, Inactivo ni Deshabilitado a la base de datos.

## Carga manual de los listados

MasterPage inicia con `hasRequestedList=false`, `loading=false` y sin datos. El efecto de consulta termina inmediatamente mientras el usuario no haya solicitado el listado. DataTable recibe un mensaje de estado inicial y la paginación se muestra recién cuando existe una respuesta, para no presentar un total de cero sin haber consultado.

La carga anterior se debía al efecto de MasterPage, que llamaba a listMasters en cada montaje sin comprobar si el usuario había solicitado datos. Workspace crea una instancia por módulo mediante su key, por lo que cada cambio de módulo disparaba otra carga. La modalidad manual había quedado documentada como propuesta pendiente; ahora se implementa en la base compartida.

| Acción                                                      | Comportamiento                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Entrar al módulo                                            | No consultar la grilla. Mostrar «Todavía no se realizó ninguna búsqueda. Aplicá filtros o usá Actualizar listado para ver registros». |
| Abrir un alta                                               | Permitirlo inmediatamente. Mantener las consultas necesarias para sugerir el código y ofrecer referencias activas.                    |
| Aplicar filtros                                             | Solicitar la primera página con los filtros aplicados, incluso si todos están vacíos.                                                 |
| Pulsar Actualizar                                           | Consultar la página actual con los filtros activos.                                                                                   |
| Cambiar de página del listado                               | Consultar la página elegida con los mismos filtros; la paginación está disponible después de buscar.                                  |
| Cancelar filtros o formulario                               | Mantener la grilla y su estado previo sin nuevas consultas. Limpiar filtros modifica solo el borrador hasta Aplicar.                  |
| Guardar sin haber consultado la grilla                      | Volver al estado inicial sin consultar el listado.                                                                                    |
| Guardar, modificar o eliminar después de haber consultado   | Actualizar la página con los mismos filtros. Si se elimina su último registro, conservar la corrección de página existente.           |
| Volver a entrar a un módulo, recargarlo o usar el historial | Volver al estado inicial sin carga automática.                                                                                        |

La condición para refrescar después de una escritura es «el usuario ya solicitó el listado», incluso si esa consulta devolvió cero registros. No depende de que existan filas visibles. Se mantienen la consulta paginada de veinte registros y su total, sin descargar toda la tabla.

El estado inicial, la carga, una búsqueda exitosa sin resultados y un error son distintos: antes de buscar aparece la orientación inicial; durante la consulta se indica carga; con cero coincidencias aparece «No hay registros para mostrar» y el total real; ante un error se muestra el aviso con la posibilidad de actualizar y no se presenta como búsqueda vacía.

Las comprobaciones de sesión, las opciones de los combos y la sugerencia de código son independientes de las consultas de grilla y siguen funcionando. No se agregan temporizadores de refresco ni cambios en el backend.

## Cómo probar esta entrega

1. En cualquiera de los seis ABM, comprobar el mensaje inicial y pulsar Actualizar para cargar datos. Seleccionar una fila y hacer doble clic en otra: debe abrirse el registro del doble clic. Cancelar debe conservar esa selección. Probar también el lápiz.
2. Abrir un alta o modificación: el foco debe estar en Código. En edición y en Clientes no debe permitir cambiar su contenido. Usar Tab y Shift+Tab para recorrer los controles siguiendo el orden visual.
3. En Clientes, comprobar que la llegada del código sugerido no lleve el foco de vuelta a Código si ya se avanzó a otro campo.
4. Dejar un campo obligatorio vacío y guardar: se conserva el mensaje y el foco en ese campo, sin volver al inicio.
5. Cambiar Registro activo con la casilla, el label o espacio; guardar y volver a abrir para comprobar su persistencia.
6. Revisar escritorio y móvil. En un perfil de consulta, el doble clic debe abrir Consultar y mantener la edición bloqueada.
7. Entrar a otro módulo y volver: no deben consultarse grillas hasta Aplicar filtros o Actualizar. Comparar la búsqueda pendiente con una búsqueda sin coincidencias. Guardar un alta antes de buscar no consulta la grilla; guardar después de buscar la actualiza, aunque la búsqueda anterior no hubiera tenido resultados. Probar también paginación, filtros conservados, eliminación y reintento tras un error.

Archivos: `components/ui/DataTable.tsx`, `components/ui/useInitialFieldFocus.ts`, `components/masters/MasterPage.tsx`, `components/masters/MasterForm.tsx`, `controls.css` y `masters.css`, todos bajo `apps/web/src`. Las medidas compartidas de labels permiten alinear el estado con el input sin duplicar la configuración de los controles.

Validación: `npm run check` (TypeScript, 19 pruebas y build con `NODE_ENV=production`) y Chromium contra MariaDB 11.8.9 aislada. Se verificaron los seis ABM, apertura de la fila correcta, bloqueo de aperturas duplicadas, foco inicial y recorrido de Tab/Shift+Tab, validaciones, sugerencias asíncronas, persistencia de Activo, eliminación, permisos de consulta y vistas de 320/375/768/1280 px. No se accedió a la base de Hostinger.

La carga manual se comprobó contando las solicitudes HTTP de grilla: cero al entrar o volver a los seis módulos, al abrir y guardar un alta sin búsqueda y al cancelar filtros o formularios. Se verificaron búsqueda sin coincidencias, refresco posterior a una búsqueda vacía, filtros conservados, paginación y baja del último registro de una página, errores y reintento, sesión/visibilidad, historial, recarga, URL directa y perfiles de consulta. Las consultas de referencias se contaron por separado.

Publicación: actualizar el PR abierto e incorporarlo a main cuando se haya revisado. Hostinger utiliza la configuración actual; no hay migraciones, dependencias ni variables nuevas.
