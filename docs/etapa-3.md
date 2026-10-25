# Etapa 3: primeros maestros y componentes de ABM

Los ajustes posteriores de interfaz y la numeración automática de CLIENTE se describen en [componentes y correlativo](ajustes-componentes.md). La interfaz actual utiliza barra de íconos con selección de fila, filtros en ventana y formularios integrados; para altas nuevas de clientes, Codigo lo asigna el backend.

## Alcance

Se habilitan seis maestros con datos reales de la base existente:

| Pantalla | Tabla | Relación principal |
|---|---|---|
| Tipos de cliente | CLIENTETIPO | Referenciada por CLIENTE.ClienteTipo |
| Clientes | CLIENTE | ClienteTipo → CLIENTETIPO.Codigo |
| Conceptos | CONCEPTO | Referencia de las futuras operaciones |
| Cajas | CAJA | Referenciada por CAJASALDO |
| Bancos | BANCO | Referencia de cuentas y cheques |
| Cuentas bancarias | BANCOCUENTA | Banco → BANCO.Codigo |

Cada pantalla ofrece listado, búsqueda, filtro de estado, paginación de veinte registros, consulta, alta, modificación, desactivación/reactivación y eliminación confirmada. Clientes y cuentas también filtran por su referencia. La búsqueda se procesa en el servidor. En la revisión actual, todos los filtros están dentro de la ventana de filtros y los combos cargan todas las opciones activas sin buscador interno; ver [componentes compartidos](ajustes-componentes.md).

Los registros se identifican por Codigo (hasta veinte caracteres), conservando los nombres del modelo. El código no se modifica luego del alta. Los datos opcionales vacíos se almacenan como NULL; documentos, números de cuenta y CBU/CVU se conservan como texto para mantener ceros iniciales. Observacion admite hasta 4000 caracteres en este formulario.

La baja elimina únicamente registros sin referencias. Si hay datos asociados, las FK bloquean la eliminación y la interfaz propone desactivar el registro. Desactivar no borra sus relaciones. Las nuevas asignaciones requieren un tipo de cliente o banco activo; al modificar un registro existente puede conservarse una referencia que posteriormente se haya desactivado.

Comprobantes, numeración y operaciones de cuenta corriente, cobros/pagos, tesorería y valores siguen pendientes. El ABM de bancos o cajas no crea aperturas, saldos ni movimientos.

## Archivos principales

- `packages/shared/src/masters.ts`: contratos y descripción de los campos públicos de los formularios.
- `apps/api/src/masters`: validación de solicitudes, rutas y persistencia de los seis maestros.
- `apps/api/src/auth/middleware.ts`: sesión y permisos para las operaciones de maestros.
- `apps/web/src/components/ui`: tabla, paginación y ventana modal reutilizables.
- `apps/web/src/components/masters`: pantalla, formulario y selector de referencias reutilizables.
- `apps/web/src/services/http.ts` y `masters.ts`: cliente HTTP y acceso a la API.
- `apps/web/src/masters.css`: estilos adaptables de listados y formularios.
- `tests/integration/masters.test.ts`: integración HTTP con datos reales en MySQL/MariaDB aislados.

No hay nuevas dependencias, tablas, campos, migraciones ni variables de entorno. Las altas, modificaciones y bajas se registran en AUDITORIA dentro de la misma transacción; si falla la auditoría, también se revierte el cambio de negocio.

## Acceso y API

Todos los endpoints `/api/maestros` requieren una sesión vigente y un usuario y rol activos. Los usuarios activos pueden consultar; el rol ADMIN puede editar. La interfaz presenta las acciones que corresponden al perfil y el servidor también controla los permisos. Las escrituras requieren JSON, el encabezado X-ERP-Request y el token CSRF de la sesión.

- `GET /api/maestros/:maestro`: filtros `q`, `estado` (todos/activo/inactivo), `pagina`, `limite` y `referencia` para clientes o cuentas. Límite máximo de cien registros por solicitud.
- `GET /api/maestros/:maestro/:codigo`: registro y versión actual, también devuelta como ETag.
- `POST /api/maestros/:maestro`: alta con los campos del formulario y Activo booleano.
- `PUT /api/maestros/:maestro/:codigo`: modificación completa; requiere If-Match con la versión recibida, entre comillas.
- `DELETE /api/maestros/:maestro/:codigo`: eliminación; requiere la misma condición de versión.

Las claves de maestro admitidas son `tipos-cliente`, `clientes`, `conceptos`, `cajas`, `bancos` y `cuentas-bancarias`. Tabla y columnas provienen de listas constantes; los valores de las consultas se parametrizan. La búsqueda trata los caracteres de LIKE como texto literal.

Las modificaciones y bajas bloquean la fila dentro de la transacción y comprueban la versión antes de escribir. Si otro usuario ya cambió el registro, la API devuelve 409; la interfaz conserva el formulario y explica que debe cerrarse y abrirse otra vez para obtener los datos actuales.

## Cómo probar

Con la instalación local de la etapa 2 y el administrador existente, ejecutar `npm run dev` e ingresar. No volver a crear el administrador si ya existe.

1. En Tipos de cliente, crear un código de prueba con descripción y estado activo.
2. En Clientes, crear un cliente asociado a ese tipo y completar los datos deseados.
3. Buscarlo por código, nombre o documento. Modificar el teléfono y recargar para comprobar persistencia.
4. Intentar eliminar el tipo utilizado: debe conservarse y mostrar el motivo. Desactivarlo desde Modificar y comprobar el filtro de inactivos.
5. Crear un banco y luego una cuenta propia asociada. Verificar que CBU/CVU mantenga sus ceros iniciales.
6. Probar altas y bajas sin referencias en Conceptos o Cajas. La baja solicita confirmación.
7. Revisar el menú móvil y los formularios. Los listados anchos tienen desplazamiento horizontal dentro de la tabla.

No se cargan datos de demostración al desplegar. Elegir los códigos y nombres reales del negocio al comenzar a utilizar los maestros.

## Publicación en Hostinger

Incorporar el PR a main y desplegar la versión nueva, manteniendo la compilación y las variables de las etapas anteriores. Si no está activo el despliegue automático, ejecutar un redeploy desde el panel.

Esta entrega no requiere ejecutar migraciones nuevas ni crear otra cuenta. Se mantienen el usuario, la contraseña y los datos existentes. Luego del despliegue, recargar el navegador e ingresar con la cuenta que ya funciona. Comprobar primero el alta de un tipo de cliente y un cliente desde la interfaz.

Las migraciones y la cuenta inicial ya fueron verificadas por el usuario en Hostinger durante la etapa 2 (21/21 tablas y primer ingreso correcto). Las pruebas de esta entrega se ejecutan exclusivamente en bases aisladas; Codex no accede a las credenciales ni modifica la base de producción.

## Comprobaciones

```sh
npm run check
npm run test:integration
npm run test:integration:mariadb
```

La integración verifica autenticación, permisos, CSRF, altas de los seis maestros, campos y referencias, duplicados, filtros, paginación, inactivación, FK de baja, conflictos de edición y auditoría transaccional. Se utiliza MySQL 8.4 y MariaDB 11.8.9.

Pasaron la comprobación de tipos y la construcción, 17 comprobaciones HTTP/criptografía y 17 comprobaciones de integración por cada motor: 51 comprobaciones del runner en total, incluyendo sus pruebas contenedoras. No hubo fallos ni pruebas omitidas.

Chromium verificó las altas de los seis maestros, modificación y persistencia al recargar, filtros, paginación, baja con referencias y baja libre, código inmutable, formularios modales y alta desde móvil. También se simuló otra edición mientras un formulario estaba abierto: se mostró el conflicto y se conservaron los datos escritos. Se comprobaron vistas de 320, 375, 768 y 1280 píxeles sin desbordamiento de página al completar el cambio de tamaño, y sin errores de JavaScript.

## Próxima entrega

Configuración de comprobantes y numeración para preparar el circuito de cuenta corriente; luego, las operaciones financieras, según el modelo acordado y las decisiones funcionales todavía pendientes.
