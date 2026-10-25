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

## Evaluación de la carga de listados: propuesta pendiente

Esta entrega conserva el comportamiento actual de carga y actualización del listado.

Actualmente, la grilla consulta una página de 20 registros y el total; no descarga toda la tabla. La API ejecuta un COUNT y una consulta con LIMIT/OFFSET. Entrar solo para dar un alta todavía provoca esa carga inicial.

Para este ERP, es razonable ofrecer el listado inicialmente sin consultar: evita solicitudes que el usuario no necesita y favorece la búsqueda explícita en tablas grandes. Agrega una acción para quien entra a consultar datos, por lo que es importante explicar el estado inicial y no confundirlo con una búsqueda sin resultados. No se midió un problema de rendimiento del hosting ni se promete una mejora cuantificada.

La recomendación para una próxima implementación es:

| Acción                                                    | Comportamiento propuesto                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Entrar al módulo                                          | No consultar la grilla; mostrar «Aplicá filtros o usá Actualizar listado para visualizar registros».                  |
| Abrir un alta                                             | Permitirlo inmediatamente. Mantener las consultas necesarias para sugerir el código y ofrecer referencias activas.    |
| Aplicar filtros o pulsar Actualizar                       | Consultar la página correspondiente, aunque no se haya ingresado texto de búsqueda.                                   |
| Cancelar filtros o formulario                             | Mantener la grilla y su estado previo sin nuevas consultas.                                                           |
| Guardar sin haber consultado la grilla                    | Volver al estado inicial, sin consultar el listado.                                                                   |
| Guardar, modificar o eliminar después de haber consultado | Actualizar la página con los mismos filtros y conservar la corrección de página cuando se elimina su último registro. |
| Volver a entrar al módulo                                 | Volver al estado inicial; no asumir que los datos anteriores siguen vigentes.                                         |

La condición para refrescar después de una escritura debe ser «el usuario ya solicitó el listado», incluso si esa consulta devolvió cero registros. No debe depender de que existan filas visibles. La grilla conservará su paginación; las comprobaciones de sesión y las consultas de referencias o códigos son independientes de esta modalidad.

Esta política queda documentada para revisar su funcionamiento antes de cambiar la carga; no se implementa silenciosamente junto con los otros ajustes.

## Cómo probar esta entrega

1. En cualquiera de los seis ABM, seleccionar una fila y hacer doble clic en otra: debe abrirse el registro del doble clic. Cancelar debe conservar esa selección. Probar también el lápiz.
2. Abrir un alta o modificación: el foco debe estar en Código. En edición y en Clientes no debe permitir cambiar su contenido. Usar Tab y Shift+Tab para recorrer los controles siguiendo el orden visual.
3. En Clientes, comprobar que la llegada del código sugerido no lleve el foco de vuelta a Código si ya se avanzó a otro campo.
4. Dejar un campo obligatorio vacío y guardar: se conserva el mensaje y el foco en ese campo, sin volver al inicio.
5. Cambiar Registro activo con la casilla, el label o espacio; guardar y volver a abrir para comprobar su persistencia.
6. Revisar escritorio y móvil. En un perfil de consulta, el doble clic debe abrir Consultar y mantener la edición bloqueada.
7. Verificar que la carga inicial y el refresco del listado después de una escritura sigan funcionando como antes.

Archivos: `components/ui/DataTable.tsx`, `components/ui/useInitialFieldFocus.ts`, `components/masters/MasterPage.tsx`, `components/masters/MasterForm.tsx`, `controls.css` y `masters.css`, todos bajo `apps/web/src`. Las medidas compartidas de labels permiten alinear el estado con el input sin duplicar la configuración de los controles.

Validación: `npm run check` (TypeScript, 18 pruebas existentes y build), build web con `NODE_ENV=production` y Chromium contra MariaDB 11.8.9 aislada. Se verificaron los seis ABM, apertura de la fila correcta, bloqueo de aperturas duplicadas, foco inicial y recorrido de Tab/Shift+Tab, validaciones, sugerencias asíncronas, persistencia de Activo, eliminación, permisos de consulta y vistas de 320/375/768/1280 px. No se accedió a la base de Hostinger.

Publicación: actualizar el PR abierto e incorporarlo a main cuando se haya revisado. Hostinger utiliza la configuración actual; no hay migraciones, dependencias ni variables nuevas.
