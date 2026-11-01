# Usuarios, permisos por menú y primer informe

Entrega incremental posterior al circuito de Valores. Incluye ajustes de presentación, administración de usuarios y un Resumen de Cuenta corriente de **saldos actuales**. No cambia las reglas de afectaciones, efectivo, numeración ni los estados de las operaciones financieras.

## Presentación

- Login: el adorno queda detrás del contenido en escritorio y se oculta en pantallas pequeñas; no se superpone al nombre o subtítulo. Se conserva el zoom manual y el tamaño de fuente móvil existente.
- Se eliminan referencias a etapas de desarrollo en login, menú, inicio y pie de página. Los documentos técnicos conservan su organización por etapas.
- El toolbar responsive de todos los ABM usa el criterio de Cuenta corriente, desde los estilos compartidos de FormToolbarActions: acciones dinámicas a la izquierda del grupo y Cerrar/Cancelar a su derecha, con márgenes comunes. Se eliminan las excepciones de ancho de Cobros y pagos.

## Usuarios y acceso individual

Solo el administrador accede a **Sistema → Usuarios**. El listado empieza vacío, permite búsqueda por nombre/correo, estado, actualización, orden remoto, paginación, Modificar, Observar y Propiedades. No existe Eliminar: desactivar conserva las relaciones históricas.

El alta incluye nombre, correo único, estado, contraseña y opciones del menú. El correo se normaliza en minúsculas. En cada opción se configura directamente:

- **Sin acceso:** no aparece en el menú y su API devuelve 403.
- **Consulta:** se puede leer, sin altas, modificaciones o correcciones.
- **Operar:** habilita las acciones del módulo, conservando todas sus validaciones actuales.

Los informes y Estado del sistema son únicamente de consulta. Inicio y Mi cuenta están disponibles para toda sesión válida. Usuarios queda reservado al administrador; no puede concederse desde la lista de permisos.

**No se crean perfiles de negocio ni un ABM de roles.** Se reutilizan USUARIO, ROL, SESION y AUDITORIA: ADMIN conserva su significado técnico de administrador con acceso completo; las altas normales usan una referencia técnica USUARIO sin permisos implícitos. No se puede promover una cuenta a administrador enviando campos adicionales a la API. Esta entrega no incorpora la creación de administradores adicionales desde la interfaz.

Las cuentas anteriores con Permisos NULL mantienen su acceso previo: ADMIN completo y los demás roles de consulta con lectura de los módulos anteriores. El nuevo informe requiere habilitación explícita para esas cuentas. Las cuentas nuevas reciben una lista explícita, vacía si no se habilita ninguna opción. Al editar una cuenta anterior queda guardada su selección individual. No se modifica la activación de roles preexistentes.

### Autenticación y contraseñas

- **Únicamente el administrador asigna/restablece contraseñas.** No hay cambio obligatorio al ingresar, cambio por el usuario ni envío por correo, según la decisión funcional acordada.
- La contraseña debe tener entre 12 y 128 caracteres. Se almacena usando scrypt con sal, como el acceso existente. La API, Propiedades y auditoría no devuelven ni guardan la contraseña en texto ni exponen su hash.
- Modificar datos, permisos o estado revoca las sesiones del usuario afectado. Restablecer su contraseña también las revoca. Debe volver a ingresar; el menú se obtiene junto con su nueva sesión, sin consultas separadas por opción.
- Al modificar el propio administrador o restablecer su contraseña se cierra también su sesión. No puede desactivar su propio usuario. El carácter de administrador no se puede cambiar desde este formulario.
- El backend obtiene la cuenta y sus permisos actuales en cada petición. No confía en el menú del navegador ni en permisos enviados con una operación.
- La creación de sesión vuelve a comprobar bajo bloqueo la credencial y activación: una autenticación iniciada con la contraseña anterior no puede dejar una sesión válida después de su restablecimiento.
- Escrituras requieren sesión, solicitud de aplicación y CSRF. Modificaciones y restablecimientos usan If-Match para detectar una versión obsoleta. Actualización, revocación de sesiones y auditoría se confirman juntas o se revierten juntas si hay un fallo.

### Consultas auxiliares

Un usuario autorizado para una operación necesita algunas referencias aunque no tenga acceso al maestro correspondiente. Por ejemplo, Cobros y pagos necesita buscar clientes y consultar documentos afectados, y Valores necesita las cuentas de destino de sus depósitos.

`/api/referencias` ofrece esas lecturas concretas con permisos explícitos y proyección de campos en los maestros restringidos. No concede acceso a los listados completos ni escrituras de `/api/maestros`, `/api/cuenta-corriente` o `/api/caja-movimiento`. La consulta de documentos desde Cobros y pagos se limita a deudas; desde Valores, a deudas vinculadas a eventos de cheques. Las operaciones consultables desde Valores deben tener valores relacionados. Las referencias de cliente de un usuario sin permiso del maestro solo contienen código, nombre y estado. Las de cuenta bancaria para Valores contienen código, banco, nombre y estado, sin CBU ni otros datos del maestro.

La administración de aperturas/cierres se comparte entre Cobros y pagos y Tesorería. Tener acceso únicamente a Tesorería permite administrar su caja mediante esas rutas compartidas, sin conceder el listado ni las operaciones comerciales de Cobros y pagos.

## Resumen de Cuenta corriente

Disponible en **Informes → Resumen de Cuenta corriente**. Tiene un criterio por código o nombre de cliente; vacío consulta todos los clientes con movimientos confirmados, incluidos los actualmente inactivos. No carga datos al entrar: se utiliza Consultar o Actualizar listado. Limpiar vacía el criterio de edición; se aplica al volver a Consultar.

Presentación: tarjetas con totales, listado por cliente, orden remoto, paginación y Propiedades. En móvil las tarjetas se apilan y la grilla conserva su desplazamiento horizontal. Totales y cantidad abarcan todo el resultado filtrado, no solo la página visible. El instante de consulta se presenta en la zona horaria del negocio.

### Significado de los importes

- **Saldo por cobrar:** deudas menos créditos confirmados de la cuenta Cobrar, incluidos los créditos internos generados por cobros.
- **Saldo por pagar:** deudas menos créditos confirmados de la cuenta Pagar, incluidos los créditos internos generados por pagos.
- **Saldo neto:** Cobrar menos Pagar. Positivo representa un neto a cobrar y negativo un neto a pagar. Es informativo; no compensa automáticamente apuestas y premios.
- Un saldo negativo dentro de una cuenta indica un importe a favor/anticipado en esa cuenta.
- **Propiedades** muestra además pendiente documental y créditos sin aplicar por cuenta. El pendiente documental se calcula desde las deudas menos afectaciones de movimientos de caja confirmados. Créditos sin aplicar es la diferencia entre ese pendiente y el saldo comercial; incluye anticipos y créditos independientes.

Ejemplo: deuda 100 y cobro aplicado de 60 → saldo 40 y pendiente 40. Otro cobro de 60 aplicado por 40 y con 20 a cuenta → saldo -20, pendiente documental 0 y crédito sin aplicar 20. No se vuelve a restar la afectación del saldo comercial.

Los anulados no integran los saldos actuales. Un original revertido conserva su asiento confirmado y se suma con su contrapartida; no se descarta el original por su estado visual Revertido. Depósitos y acreditaciones no vuelven a afectar Cuenta corriente. El rechazo de un cheque genera su nueva deuda y, cuando corresponda, la compensación específica del anticipo original.

La consulta usa una transacción de solo lectura con snapshot coherente para filas, totales y cantidad. Los importes se agregan como DECIMAL en SQL y viajan como texto, sin conversiones a Number.

**No hay filtro de fechas en esta primera versión.** Recortar los movimientos de un intervalo no equivale a obtener un saldo a una fecha. Reconstruir saldos históricos y correcciones requiere una entrega específica. Tampoco se agregan impresión, exportación ni un motor general de reportes.

## Publicación

La migración **0009_permisos_usuarios** agrega únicamente `USUARIO.Permisos`, JSON nullable. Conserva usuarios, contraseñas, sesiones, roles, movimientos y las 21 tablas actuales. El informe no requiere cambios financieros de esquema ni datos. No hay nuevas dependencias ni variables de entorno.

Aplicar las migraciones desde la raíz de la versión vigente desplegada, con las variables de la aplicación disponibles en esa sesión SSH y antes de habilitar el código nuevo:

```sh
npm run db:migrate:prod
npm run db:check:prod
```

Ejecutar el segundo comando solo si el primero termina correctamente. Utilizar el proceso habitual de mantenimiento/despliegue de Hostinger; no ejecutar db:generate allí. Si se publicó otra versión mientras se conservaba una sesión SSH anterior, volver a entrar al directorio `hbuilds/current/nodejs` antes de usar npm.

La migración no se ejecutó sobre Hostinger durante el desarrollo. Las comprobaciones de integración usan bases aisladas. Un intento fallido de login tras publicar puede indicar que el código nuevo se inició antes de aplicar la columna; revisar la migración y las variables del entorno antes de cambiar credenciales.

## Prueba de aceptación

1. Desde Safari/iPhone y escritorio revisar login, título/subtítulo y ausencia de etiquetas Etapa. Comparar Guardar/Cancelar en Cuenta corriente, Cobros y pagos, Tesorería y maestros, sin superposiciones ni botones contra el borde.
2. Como administrador, abrir Usuarios. Crear una cuenta habilitando solo Cuenta corriente y Cobros y pagos con Operar. Ingresar con ella en otra sesión: solo deben aparecer sus opciones, Inicio y Mi cuenta. Buscar clientes y utilizar Afectaciones debe seguir funcionando sin acceso al maestro de Clientes.
3. Intentar una URL de otro módulo: debe mostrar acceso restringido. Una petición directa a su API debe responder 403. Un usuario sin opciones habilitadas no puede consultar las APIs de módulos.
4. Probar Consulta en un módulo: permite consultar/Propiedades, pero no escribir. Habilitar únicamente Valores y comprobar selección de cuentas, operaciones relacionadas y opciones de rechazo. Habilitar únicamente Tesorería y comprobar administración de caja sin habilitar operaciones comerciales.
5. Modificar permisos o desactivar una cuenta que mantiene una sesión abierta: su próxima petición debe requerir un nuevo ingreso. Una cuenta inactiva no inicia sesión. Restablecer contraseña: la anterior deja de servir y se cierran las sesiones; el usuario no dispone de una opción para cambiarla. El administrador no puede desactivarse a sí mismo.
6. Habilitar el informe. Comprobar que comienza sin consultar; buscar un cliente con deuda 100 y cobro 60: por cobrar 40. Premio 80 y pago 30: por pagar 50, neto -10. Comparar los pendientes del selector de Afectaciones.
7. Probar anulación y reversión mediante los circuitos habituales; actualizar el informe y comparar con sus contrapartidas. Los anticipos deben distinguirse del pendiente documental en Propiedades, sin nuevas cancelaciones ficticias.
8. Probar clientes sin filtro, activos/inactivos con movimientos, búsqueda, orden descendente/ascendente/restablecer, paginación y totales generales. Revisar móvil y grilla horizontal. No debería requerir caja abierta para consultar el informe.

## Verificación de desarrollo

- TypeScript, pruebas unitarias y compilación del proyecto.
- Integración aislada en MySQL y MariaDB: permisos por menú/CSRF, altas y correcciones de usuarios, claves, revocación y rollback, consultas auxiliares sin acceso al ABM, y reportes con circuitos reales de cobro/pago parcial, anticipos, anulaciones, reversión, depósito/acreditación/rechazo, precisión decimal y paginación. La consulta del informe se compara con las tablas antes/después para verificar ausencia de escrituras.
- Chromium con API simulada: login en 320/430/1440 px, alta/Propiedades/restablecimiento, menú individual y ruta restringida, informe bajo demanda, tarjetas en móvil y distribución uniforme de acciones. No sustituye la prueba de Safari real ni la aceptación del despliegue.

## Archivos afectados

| Área | Archivos |
|---|---|
| Login y presentación compartida | `apps/web/src/components/Login.tsx`, `apps/web/src/styles.css`, `apps/web/src/masters.css`, estilos de Cuenta corriente y Cobros y pagos. |
| Navegación y permisos de acciones | `apps/web/src/components/Workspace.tsx`, `apps/web/src/navigation.ts`, `MasterPage.tsx`, `CurrentAccountPage.tsx`, `CashPage.tsx` y `ValuesPage.tsx` en sus directorios de componentes. |
| Usuarios | `apps/api/src/users/routes.ts`, `apps/api/src/users/store.ts`, `apps/web/src/components/users/UsersPage.tsx`, `apps/web/src/components/users/users.css`, `packages/shared/src/users.ts` y `packages/shared/src/permissions.ts`. |
| Sesiones y protección de rutas | `apps/api/src/auth/middleware.ts`, `auth/store.ts`, `auth/service.ts`, rutas de Maestros/Cuenta corriente/Cobros y pagos/Valores y registro de servicios en `apps/api/src/app.ts` y `server.ts`. |
| Consultas auxiliares | `apps/api/src/references/routes.ts`, `apps/web/src/services/masters.ts`, `ClientSearch.tsx`, `CurrentAccountProperties.tsx`, `CashProperties.tsx`, `masters/master-properties.ts` y `values/ChequeRejection.tsx` en los directorios correspondientes de componentes. |
| Informe | `apps/api/src/reports/routes.ts`, `reports/store.ts`, `reports/validation.ts`, `apps/web/src/components/reports/AccountSummaryPage.tsx`, `reports/reports.css` y `packages/shared/src/reports.ts`. |
| Esquema y contratos | `apps/api/src/database/schema.ts`, `database/check.ts`, `database/migrations/0009_permisos_usuarios.sql`, metadatos de migración y `packages/shared/src/index.ts`. |
| Verificación y documentación | `tests/integration/administration-reports.test.ts`, `tests/record-properties.test.ts`, `scripts/integration.mjs`, `README.md`, este documento, `docs/entregas-y-pendientes.md`, `docs/arquitectura.md` y `docs/modelo.md`. |
