# Ajustes de los componentes compartidos y código automático de clientes

## Listados

La barra compartida muestra, en este orden: Agregar, Modificar, Eliminar y Filtrar. Los botones contienen íconos; sus etiquetas y tooltips se proporcionan mediante las propiedades de ActionToolbar. Los tooltips aparecen con ratón o foco de teclado. Los perfiles de consulta conservan Consultar y Filtrar, sin habilitar escrituras.

DataTable permite seleccionar una sola fila mediante clic o el control de selección, también operable con teclado. La fila se resalta y se habilitan Modificar y Eliminar cuando corresponde al perfil. La selección se limpia al cambiar la búsqueda, aplicar filtros, paginar o actualizar el listado. Las acciones se bloquean brevemente mientras se obtiene un registro para abrirlo.

El buscador general permanece visible. Filtrar abre una ventana que reutiliza Modal y ReferenceSelect. FilterDialog recibe los campos y opciones desde el módulo: actualmente, estado y tipo de cliente o banco cuando corresponde. Aplicar modifica el listado y vuelve a la primera página; Cancelar descarta el borrador. Limpiar restablece el borrador y hay que presionar Aplicar para hacerlo efectivo. Limpiar los filtros avanzados conserva la búsqueda general. El ícono indica si existen filtros avanzados aplicados.

## Formularios dentro del módulo

MasterForm reemplaza temporalmente al listado dentro del área principal. Agregar abre un formulario vacío; Modificar o Consultar obtienen los datos actuales del registro seleccionado. No se abre una pestaña nueva ni un modal de alta/modificación.

Guardar correctamente devuelve al listado y lo actualiza. Cancelar vuelve sin guardar. Se conservan la búsqueda, los filtros y la página (si una eliminación dejó la página fuera de rango, se ajusta a la última disponible). El código de los registros existentes sigue siendo inmutable.

Las validaciones se muestran junto a los campos y en un resumen dentro del formulario. El foco pasa al primer campo incorrecto; si el error es general, al resumen. Se conservan los valores escritos, incluso ante conflictos de edición. No se agregan ventanas para errores habituales: las ventanas quedan para filtros y confirmación de eliminación.

## Numeración de CLIENTE sin tabla adicional

Las nuevas altas de CLIENTE reciben un Codigo de cinco dígitos generado por el backend al guardar: 00001, 00002, etc. El formulario indica que se asignará al guardar y la respuesta informa el código real. La API no permite elegir manualmente el código de una nueva alta; el dato se omite del POST. Los demás maestros conservan sus códigos manuales.

Se conserva CLIENTE.Codigo como VARCHAR(20) y PK, por lo que las relaciones y los códigos anteriores no se renumeran. No se agrega SECUENCIA ni se utiliza NUMERACION, que continúa vinculada a comprobantes.

El correlativo toma el mayor valor numérico entre los códigos existentes compuestos por uno a cinco dígitos, incluyendo clientes inactivos. Por ejemplo, si existe 37, el siguiente será 00038. Los códigos alfanuméricos o numéricos de más de cinco caracteres se conservan como códigos anteriores y no participan del cálculo. Si no hay códigos numéricos compatibles, comienza en 00001.

La asignación utiliza una conexión dedicada del pool y un bloqueo GET_LOCK cuyo nombre identifica la base de datos:

1. Obtener el bloqueo antes de iniciar la transacción y su primera lectura.
2. Consultar MAX numérico y formar el siguiente código con ceros.
3. Insertar el cliente y su auditoría dentro de esa transacción.
4. Confirmar o revertir y, después, liberar el bloqueo en la misma conexión.

El tiempo de espera del bloqueo es de diez segundos. Si no se obtiene, no se asigna un número ni se inserta el cliente. Si la liberación no puede verificarse, se cierra la conexión para no devolverla bloqueada al pool. La PK mantiene la protección final contra duplicados. Las altas de clientes desde la aplicación pasan por este mismo mecanismo.

Si la transacción se revierte, el número no queda reservado. Al llegar a 99999, la siguiente alta se rechaza con un mensaje y sin crear datos.

**Limitación acordada del mecanismo sin contador persistente:** eliminar el cliente con el mayor código puede hacer que ese número se reutilice. Desactivar conserva el registro y su número. El historial de auditoría se mantiene, pero no se usa como contador.

## Archivos principales

- Se adaptan DataTable, MasterPage y MasterForm existentes.
- ActionToolbar concentra la nueva barra; FilterDialog reutiliza Modal para los filtros y recibe su configuración, sin duplicar listados o formularios por módulo.
- Icon y masters.css incorporan los íconos y estilos, conservando la apariencia general.
- La descripción compartida de maestros identifica el código automático de CLIENTE.
- Las rutas, validación y repositorio de maestros implementan la asignación en el backend; el cliente HTTP omite Codigo únicamente al dar de alta clientes.
- La integración de maestros verifica la generación concurrente, rollback, códigos anteriores, inactivos y agotamiento.

## Cómo revisar

1. En Tipos de cliente, comprobar el orden de los cuatro íconos y sus tooltips. Sin selección, Modificar y Eliminar deben estar deshabilitados.
2. Seleccionar filas con clic y teclado y comprobar el resaltado y la selección única.
3. Abrir Filtrar, probar Estado, Cancelar, Limpiar y Aplicar; repetir con Tipo de cliente en Clientes y Banco en Cuentas bancarias.
4. Agregar un registro y cancelar: el listado debe volver con su contexto. Repetir guardando correctamente y modificando una fila seleccionada.
5. Intentar guardar campos obligatorios vacíos y comprobar mensajes, foco y conservación del formulario.
6. Crear un cliente sin ingresar código. Verificar los cinco dígitos asignados y que los clientes anteriores conserven su código.
7. Revisar las acciones en móvil y con un perfil de consulta.

## Publicación

Incorporar el PR a main y desplegar en Hostinger con la configuración actual. No hay migraciones, tablas, dependencias ni variables de entorno nuevas. No repetir la creación del administrador. Recargar la aplicación para utilizar el frontend actualizado e ingresar con la cuenta existente.

## Comprobaciones

Ejecutar `npm run check`, `npm run test:integration` y `npm run test:integration:mariadb`. La integración usa únicamente bases efímeras y mantiene el esquema de 21 tablas.

Pasaron tipos, construcción y 59 comprobaciones del runner (incluidas sus pruebas contenedoras): 17 HTTP/criptografía y 21 de integración en cada motor, MySQL 8.4 y MariaDB 11.8.9. Se comprobaron 16 altas simultáneas desde dos instancias con pools independientes, los códigos 00002–00017, la liberación tras rollback, la conservación de códigos anteriores, el límite y la reutilización posible tras eliminar el último.

Chromium verificó los seis maestros, orden de botones y tooltips, selección y teclado, filtros y borradores, formularios integrados, errores y foco, contexto de paginación, códigos 00001–00003, cancelación, persistencia, conflictos, permisos de consulta y vistas de 320, 375, 768 y 1280 píxeles sin desbordamiento de página ni errores de JavaScript. No se accedió a la base de Hostinger.
