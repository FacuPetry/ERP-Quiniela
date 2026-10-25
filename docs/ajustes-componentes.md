# Componentes compartidos de listados y ABM

## Listados, filtros y selección

La barra muestra Agregar, Modificar/Consultar, Eliminar y Filtrar, seguidos de Actualizar listado. Las acciones son íconos con etiquetas y tooltips configurables. Los permisos de consulta y edición se mantienen.

Al entrar o volver a un módulo, la grilla inicia sin consultar y muestra un mensaje de búsqueda pendiente. Aplicar filtros o Actualizar activa la consulta paginada. La paginación aparece después de recibir datos; una búsqueda sin coincidencias muestra el total real de cero y un mensaje distinto del estado inicial.

La búsqueda general, estado, referencias y otros filtros se configuran exclusivamente en FilterDialog. El listado no muestra campos de búsqueda externos. Aplicar usa el borrador y vuelve a la primera página; Cancelar lo descarta; Limpiar restablece todos los criterios, incluida la búsqueda general, y requiere Aplicar para hacerlos efectivos. El ícono indica si hay filtros aplicados.

DataTable conserva selección única por clic en cualquier celda no interactiva y por teclado. Los radios se mantienen visualmente ocultos dentro de la primera celda para conservar su semántica y navegación, sin una columna adicional. La fila se resalta y muestra un contorno al navegar con teclado. Modificar y Eliminar se habilitan según selección y permisos.

El doble clic sobre una fila abre Modificar/Consultar mediante la misma función del toolbar. El foco inicial de los formularios pasa a Código y el estado se agrupa en la fila superior. Ver [apertura y navegación](navegacion-abm.md) para los permisos, orden de Tab y pruebas.

La selección se mantiene durante la comprobación de sesión, al cancelar un formulario y al actualizar manualmente si el registro sigue en la página. Se limpia al cambiar de página, aplicar filtros, guardar o eliminar; si una actualización confirma que la fila ya no está visible, también se limpia.

## Por qué se perdía la selección

El listado no tenía un temporizador propio. App comprueba la sesión cada minuto y al volver a la pestaña; esa respuesta recreaba el callback de cierre de sesión. MasterPage lo utilizaba como dependencia de su efecto de carga, por lo que consultaba otra vez la lista y borraba la selección.

Ahora el callback de App es estable y MasterPage mantiene una referencia al manejador vigente sin convertir su identidad en una dependencia de carga. Se conserva la comprobación de sesión para reflejar vencimientos, revocaciones y desactivaciones, pero esa comprobación no recarga datos del listado. Solo cambian los datos por una acción explícita de filtros, paginación o refresco, o después de una escritura propia.

## Combos sencillos y filtrado por contexto

ReferenceSelect utiliza el [DropDown compartido](controles-base.md), con presentación personalizada y sin buscador interno. Conserva la carga de todas las páginas de opciones activas, sin truncar a las primeras cien, y no ofrece registros inactivos. El modelo actual utiliza Activo; no se agregan campos de visibilidad.

El componente admite `query` para filtros soportados por la fuente y `optionFilter` para restringir las opciones desde el código del módulo. Ambos respetan la condición de activo. Esto prepara el filtrado por contexto de futuros comprobantes, sin implementar todavía ese módulo ni sus reglas.

Si una referencia de un registro existente fue desactivada o queda fuera del contexto, se conserva su valor mediante una opción actual oculta y deshabilitada, acompañada de una explicación. No se ofrece para nuevas selecciones. Así no se cambian relaciones existentes ni se obliga a reasignarlas al editar otros campos.

## Descripciones de relaciones en las grillas

En Clientes, Tipo de cliente muestra `CLIENTETIPO.Descripcion`; en Cuentas bancarias, Banco muestra `BANCO.Nombre`. Los códigos siguen en `CLIENTE.ClienteTipo` y `BANCOCUENTA.Banco` y se utilizan al seleccionar, filtrar, abrir o guardar un registro. Los textos se consultan mediante LEFT JOIN en la lectura del listado; no se agregan columnas descriptivas a las tablas principales ni se consulta cada referencia por separado desde el navegador. Las referencias inactivas ya asociadas conservan su descripción visible.

La configuración reutilizable es `relationLabelField` en el campo de referencia de `masterDefinitions`: `Descripcion` para ClienteTipo y `Nombre` para Banco. La revisión de los seis ABM confirmó que estas son las dos referencias mostradas en las grillas actuales. Tipos de cliente, Conceptos, Cajas y Bancos muestran datos propios; sus códigos identificadores se conservan visibles.

Para cualquier nuevo listado, definir el campo descriptivo de cada relación incluida en `columns`. Se reutilizan la consulta y el renderizado compartidos, sin agregar lógica por entidad. `tests/master-definitions.test.ts` recorre las definiciones y falla si una referencia visible no tiene configurado un campo descriptivo válido o se apunta nuevamente a Codigo. El texto se elige por su finalidad funcional, sin asumir que siempre se llama Descripcion.

La API mantiene `registros` con sus códigos y entrega las etiquetas en el mapa opcional `descripciones` (campo de referencia → código → texto). MasterPage utiliza ese mapa para presentar las columnas. El detalle, la escritura, las versiones de edición y la auditoría no reciben etiquetas adicionales. Si falta una descripción, se muestra el código como alternativa. Los criterios actuales de búsqueda, orden y paginación se conservan.

Para probar: crear o elegir un tipo con código y descripción distintos, asignarlo a un cliente y revisar su columna Tipo de cliente. Repetir con un banco y una cuenta bancaria: la columna Banco debe mostrar el nombre. Cambiar la descripción del tipo o el nombre del banco desde su maestro y volver al listado asociado o actualizarlo: el texto debe reflejar el cambio sin editar al cliente o la cuenta. Al abrir el formulario, el combo sigue identificando la referencia por código. No se requieren migraciones ni variables nuevas.

## Formularios y botones superiores

MasterForm sigue reemplazando al listado dentro del módulo. Su toolbar superior muestra el título a la izquierda y Cancelar/Guardar a la derecha, en todos los maestros. Guardar está asociado al formulario mediante su identificador, aunque el botón esté en el encabezado. Los perfiles de consulta muestran Cerrar.

Guardar correctamente actualiza la lista. Cancelar vuelve sin escribir y conserva búsqueda, filtros, página y selección si siguen siendo válidos. Las validaciones permanecen junto a los campos y en un resumen con foco; no abren modales ni borran los valores ingresados. Los modales se reservan para filtros y confirmación de baja.

Las altas, modificaciones y bajas correctas no muestran un aviso de éxito: si el usuario ya había solicitado el listado, se actualiza la grilla con sus filtros, aunque antes no hubiera coincidencias. Un alta previa a la primera búsqueda vuelve al estado inicial sin consultar. No se recarga toda la página. Agregar mantiene el ícono blanco al pasar el ratón, cambiando únicamente el fondo verde; Modificar usa un lápiz simple y Actualizar una flecha circular. La posible sustitución de las validaciones por un modal agrupado sigue pendiente de revisión y no se implementa en este ajuste.

Los botones habilitados utilizan cursor de puntero. Los deshabilitados indican que la acción no está disponible, sin cursor de espera. Esto corrige Anterior/Siguiente en los límites de paginación; los límites y el bloqueo durante una carga se mantienen.

## Código sugerido y definitivo de CLIENTE

Al abrir el alta, se consulta `GET /api/maestros/clientes/meta/siguiente-codigo`, con sesión y sin caché. Es una lectura del mismo cálculo que utiliza el guardado: no reserva números, no toma el bloqueo de asignación y no crea auditoría. El campo muestra la sugerencia de cinco dígitos y avisa que puede cambiar si otra persona registra antes. Si la consulta falla, se ofrece reintentar.

Al guardar, el frontend omite Codigo en el POST, aunque haya mostrado una sugerencia. El backend sigue obteniendo GET_LOCK por base, inicia la transacción después de adquirirlo, calcula el máximo numérico e inserta cliente y auditoría en la misma conexión. Confirma o revierte y luego libera el bloqueo. Si no puede verificar su liberación, cierra la conexión antes de devolverla al pool. La respuesta informa el código definitivo.

Los nuevos códigos siguen siendo textos de cinco dígitos desde 00001, sin SECUENCIA ni cambios a CLIENTE.Codigo (VARCHAR(20), PK). Los códigos anteriores se conservan y no se renumeran. Participan del máximo los códigos de uno a cinco dígitos, incluidos los inactivos; los alfanuméricos o más largos se conservan fuera de ese cálculo. El límite 99999 detiene nuevas altas. Eliminar el mayor código puede permitir reutilizarlo; desactivar lo conserva. La sugerencia no modifica ninguna de estas reglas.

## Archivos principales

- `App.tsx`: callback estable; se conserva la validación de sesión.
- `MasterPage.tsx`: filtros centralizados, refresco explícito y conservación de selección.
- `ReferenceSelect.tsx` y el servicio de maestros: opciones completas, activas y filtrables desde código.
- `MasterForm.tsx`: toolbar superior y sugerencia de código; validaciones existentes.
- `DataTable.tsx`: selección accesible sin radio visible ni columna adicional.
- `ActionToolbar.tsx`, `FilterDialog.tsx`, `Icon.tsx` y estilos: acción de refresco, búsqueda en modal, distribución y cursores.
- API de maestros y contratos compartidos: endpoint de sugerencia y cálculo compartido con la asignación definitiva.
- Pruebas de integración y `reference-options.test.ts`: lectura sin reserva, concurrencia, paginación de opciones y filtros de contexto.

## Cómo probar

1. En Tipos de cliente, comprobar que inicialmente no se consulta la grilla. Pulsar Actualizar o aplicar filtros y seleccionar una fila haciendo clic o usando teclado. No debe verse un radio. Esperar una comprobación de sesión o cambiar de pestaña y volver: la selección debe mantenerse.
2. Usar Actualizar listado: la fila debe seguir seleccionada si permanece en la página. Cambiar de página o aplicar otros filtros limpia la selección cuando corresponde.
3. Abrir Filtrar: allí deben estar Búsqueda general y Estado, más Tipo de cliente o Banco en los módulos correspondientes. Probar Aplicar, Cancelar y Limpiar. No debe quedar un buscador externo.
4. Abrir un alta: Cancelar y Guardar deben estar junto al título. Comprobar errores de campos obligatorios y que Cancelar no escriba datos.
5. En Clientes, comprobar el código sugerido y que el combo muestre todos los tipos activos, sin textbox de búsqueda. Repetir con Banco en Cuentas bancarias.
6. Abrir dos altas de cliente antes de guardar: pueden mostrar la misma sugerencia. Guardarlas sucesivamente debe producir códigos definitivos distintos, informados al volver al listado.
7. Revisar Anterior/Siguiente: puntero cuando están habilitados, sin cursor de espera cuando se llega a un límite. Revisar también la vista móvil.

## Publicación y verificación

Incorporar el PR a main y desplegar con la configuración actual de Hostinger. No ejecutar migraciones ni volver a crear el administrador; no hay tablas, dependencias ni variables de entorno nuevas. Recargar la aplicación e ingresar con la cuenta existente.

Pasaron `npm run check` y las integraciones aisladas con MySQL 8.4 y MariaDB 11.8.9: 67 comprobaciones del runner contando sus pruebas contenedoras (19 de HTTP/criptografía/opciones/configuración y 24 de integración por motor). Se conservan las pruebas de altas simultáneas, rollback, referencias, agotamiento y esquema de 21 tablas. Se verifican las descripciones de tipos y bancos, sus cambios e inactivación sin alterar las FK ni las versiones de edición, y la configuración de referencias para futuras grillas.

Chromium verificó combos con más de cien opciones activas y sin buscador, exclusión de inactivos, conservación de una referencia anterior desactivada, toolbar superior, dos formularios con la misma sugerencia y códigos finales distintos, radios ocultos y teclado, filtros solo en modal, cursores, selección estable tras sesión/visibilidad/refresco manual y Cancelar, validaciones y vistas de 320/375/768/1280 píxeles sin desbordamiento de página ni errores de JavaScript. No se accedió a la base de Hostinger.

En la revisión de relaciones, Chromium comprobó Clientes y Cuentas bancarias: textos actualizados al renombrar o desactivar el maestro, códigos conservados al guardar, ausencia de solicitudes por fila, permisos de consulta y vistas de escritorio y móvil. El mecanismo de presentación y la consulta compartida se reutilizan sin agregar lógica específica al frontend o backend.
