# Preparación para Hostinger

El usuario confirmó que su contratación permite aplicaciones Node.js sin upgrade. Esta guía prepara el despliegue; no acredita una publicación ya realizada ni acceso a su hPanel.

## Aplicación

Configurar la raíz como la carpeta que contiene `package.json`. Seleccionar Node.js 24. Si el alojamiento no ofrece esa versión, revisar la compatibilidad antes de instalar: el proyecto declara Node 24 explícitamente.

- Instalación de construcción: `npm ci --include=dev`.
- Construcción: `npm run build`.
- Arranque: `npm start`.
- Si hPanel solicita un archivo de entrada en vez de un comando: `apps/api/dist/server.js`, después de construir.

El build necesita TypeScript y Vite, aunque el proceso final corra en producción. No omitir dependencias de desarrollo antes de construir o migrar.

## Variables del alojamiento

| Variable | Uso |
|---|---|
| NODE_ENV | `production` |
| HOST | `0.0.0.0` |
| PORT | Puerto asignado por el alojamiento |
| DB_HOST | Host proporcionado para MySQL |
| DB_PORT | Puerto proporcionado para MySQL |
| DB_NAME | Base dedicada para el ERP |
| DB_USER | Usuario de esa base |
| DB_PASSWORD | Valor ingresado de forma segura en el panel |
| DB_SSL | `true` cuando la conexión requiere TLS |
| DB_SSL_CA_PATH | Certificado CA si el proveedor utiliza una CA particular |

Con DB_SSL=true se verifican el certificado y el nombre del servidor. Si el proveedor documenta una conexión interna sin TLS, DB_SSL=false debe responder a esa configuración real. No desactivar verificación para resolver errores de certificados.

DB_ROOT_PASSWORD, Docker y WEB_PORT no son requisitos de producción. No subir el `.env` local ni sus credenciales. La base de producción se configura independientemente.

## Primera publicación

1. Crear una base dedicada y obtener sus datos de conexión en hPanel.
2. Configurar las variables y el mecanismo de despliegue ofrecido por el panel, mediante repositorio o carga de archivos.
3. Instalar y construir desde la raíz.
4. Comprobar el motor, versión y `lower_case_table_names`. Para conservar físicamente las mayúsculas de este esquema, MySQL debe utilizar el comportamiento correspondiente; no cambiar esa opción sobre un servidor existente como solución rápida.
5. Aplicar migraciones desde una ejecución controlada: `npm run db:migrate:prod`. Si no existe consola o comando de predespliegue, resolver con el proveedor un mecanismo de ejecución antes de publicar; no agregar un endpoint web que ejecute migraciones.
6. Arrancar la aplicación y asociar el dominio o subdominio con HTTPS desde el panel.
7. Verificar la página, `/api/health` y `/api/ready` desde el dominio asignado.

No introducir credenciales en GitHub, frontend ni scripts. No se incorporan migraciones al comando start.

## Actualizaciones

Comprobar pruebas y build antes de publicar. Respaldar la base antes de migraciones sobre datos reales, aplicar cambios pendientes y reiniciar. Un rollback de código no revierte automáticamente una migración de MySQL: revisar compatibilidad y procedimiento de recuperación antes del cambio.

El ERP se publica como aplicación independiente y puede usar un subdominio. Sus archivos no deben reemplazar los de los sitios existentes.
