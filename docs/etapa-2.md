# Etapa 2: acceso y navegación

## Entrega

- Ingreso mediante correo y contraseña, cierre de sesión y recuperación al recargar.
- Contraseñas con scrypt y sal aleatoria; sesiones opacas de ocho horas. Solo su hash se guarda en SESION.
- Cookie HttpOnly, SameSite=Lax, Path=/ y Secure en producción. HTTPS es necesario en producción.
- El servidor comprueba usuario y rol activos, vencimiento y revocación en cada consulta de sesión. La interfaz revalida al volver a la pestaña y cada minuto.
- Protección de solicitudes de acceso con encabezado propio, sin CORS. Cierre con token CSRF. Límite de intentos por correo y dirección de conexión, en memoria y por proceso.
- Menú lateral contraíble en escritorio, panel móvil con Escape y navegación con teclado, rutas y estado activo.
- Inicio, datos de la cuenta y verificación de servicios. Los módulos comerciales muestran su alcance y están señalados como próximas entregas.
- Alta del primer administrador mediante un comando interactivo, con contraseña oculta y registro en AUDITORIA.

No se agregan tablas, campos, migraciones ni dependencias. Se utilizan ROL, USUARIO, SESION y AUDITORIA del modelo original. El rol ADMIN se crea únicamente cuando se prepara el primer usuario. No hay contraseñas predeterminadas, registro público ni recuperación de claves implementada.

El perfil se muestra en la cuenta; los permisos por acción se incorporarán junto con las operaciones reales. Todavía no existen ABM de usuarios, tablas maestras ni endpoints financieros. La interfaz no muestra saldos ficticios.

## Prueba local

Desde la raíz y con el `.env` local ya configurado:

```sh
npm ci
npm run db:up
npm run db:migrate
npm run db:check
npm run admin:create
npm run dev
```

`admin:create` solicita nombre, correo y una contraseña nueva de entre 12 y 128 caracteres, dos veces. La contraseña es de acceso al ERP y es diferente de DB_PASSWORD. La terminal no muestra la contraseña mientras se escribe. Nunca pasarla como argumento del comando ni guardarla en GitHub. El comando rechaza el alta si ya existe cualquier usuario y no modifica cuentas existentes.

Ingresar con esos datos. Revisar Inicio, Mi cuenta, el estado del sistema, cada entrada del menú, el modo compacto y la vista móvil. Recargar conserva el acceso; Cerrar sesión debe volver al formulario y una recarga no debe recuperar esa sesión. Un correo o una clave incorrectos deben mostrar el mismo mensaje.

En producción se utiliza el dominio con HTTPS. En desarrollo se utilizan cookies sin Secure; no cambiar NODE_ENV de producción para resolver una conexión SSH o un problema del proxy.

## Hostinger y primera cuenta

Se mantiene la configuración que permitió publicar la etapa 1: Other, Node.js 24, raíz `./`, npm, compilación `npm run build`, salida `.`, entrada `apps/api/dist/server.js`. La compilación no se conecta a la base, no migra y no crea administradores. Asegurar que la instalación incluya las dependencias de desarrollo necesarias para TypeScript y Vite (`NPM_CONFIG_INCLUDE=dev`).

Antes de completar el primer ingreso, acceder por SSH a la carpeta del despliegue que contiene package.json. No asumir una ruta de Hostinger: obtenerla en el panel o localizarla con el soporte. Comprobar que esa terminal utiliza Node 24.

La terminal SSH debe disponer de las mismas variables DB que el proceso web. No se heredan necesariamente del panel. Si no están disponibles, cargarlas mediante el mecanismo privado del alojamiento o un archivo `.env` exclusivo de producción y con permisos restringidos, fuera de archivos públicos y de Git. No copiar el `.env` de Docker ni colocar claves en el historial de comandos. El código carga `.env` desde la raíz y da prioridad a las variables ya presentes en el proceso.

Desde la raíz del despliegue construido y usando la base exclusiva del ERP:

```sh
npm run db:migrate:prod
npm run db:check:prod
npm run admin:create:prod
```

Ejecutarlos en ese orden, revisando la salida de cada uno antes de continuar. Si existen datos, respaldar antes de migrar. El primer comando aplica las migraciones pendientes; el segundo debe informar 21/21 tablas y encontrar el historial; el tercero solicita los datos de la primera cuenta de forma interactiva. Ninguno se ejecuta automáticamente al iniciar la web. La creación del administrador usa un bloqueo y una transacción para impedir dos altas iniciales simultáneas.

No importar manualmente el SQL desde phpMyAdmin como reemplazo de estas migraciones. Si una migración falla, detenerse y revisar su estado antes de repetir: MySQL y MariaDB no revierten automáticamente todo el DDL.

La configuración local debe corresponder a las indicaciones recibidas de Hostinger para este alojamiento. No se incorporan direcciones, usuarios ni credenciales reales del usuario al repositorio.

## Verificación automatizada

```sh
npm run check
npm run test:integration
npm run test:integration:mariadb
```

La integración usa contenedores efímeros y credenciales aleatorias; no toca Hostinger ni la base de desarrollo. Comprueba migraciones, 21 tablas, secuencias, claves foráneas, importes, alta concurrente del administrador, hashes, sesiones persistentes, desactivación y revocación real. Las pruebas HTTP verifican cookies, CSRF, vencimiento, rotación y límites de intentos.

La suite MariaDB está fijada a 11.8.9, la versión informada por el alojamiento. Reproducir esa versión no reproduce todos sus permisos, configuración y límites: el despliegue real debe verificarse también.

### Resultado de esta entrega

Pasaron TypeScript, la construcción completa, 17 comprobaciones del runner HTTP/criptografía y nueve comprobaciones de integración por cada motor (35 en total, contando las pruebas contenedoras del runner). No hubo fallos ni pruebas omitidas.

En una base MariaDB aislada se comprobó además que `db:check:prod` rechaza una base vacía e informa 21/21 después de migrar. Se ejecutó el alta real desde una terminal interactiva y se comprobó que no muestra la contraseña. Chromium verificó ingreso incorrecto y correcto, cookie Secure/HttpOnly, recarga, navegación e historial, persistencia del menú compacto, cierre de sesión, menú móvil con Escape y foco, y vistas de 320, 375, 768 y 1280 píxeles sin desbordamiento horizontal al completar el cambio de tamaño. No aparecieron errores de JavaScript.

## Siguiente entrega

Componentes reutilizables de listados, filtros y formularios, y primeros ABM de tablas maestras. No avanzar a operaciones financieras sin revisar previamente esta etapa.
