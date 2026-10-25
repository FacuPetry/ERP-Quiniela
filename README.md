# ERP-Quiniela

Aplicación de cuenta corriente y tesorería. Desarrollo incremental: cada etapa se implementa, se comprueba y se revisa antes de continuar.

## Estado: etapa 3

Incluye React + TypeScript + Vite + Tailwind, API Express, conexión MySQL/MariaDB, esquema Drizzle y migraciones de las **21 tablas acordadas**. Dispone de acceso de usuarios, sesiones persistentes, menú adaptable y ABM de tipos de cliente, clientes, conceptos, cajas, bancos y cuentas bancarias. La configuración de comprobantes, sus series de numeración y las operaciones financieras se incorporarán en próximas entregas.

Los maestros utilizan selección de fila, acciones con íconos, filtros en ventana y formularios dentro del módulo. Los códigos de clientes se asignan automáticamente con cinco dígitos al guardar, sin tabla adicional. Ver [ajustes de componentes y correlativo](docs/ajustes-componentes.md), incluidos el tratamiento de códigos anteriores y la posible reutilización del último eliminado.

## Requisitos

- Node.js 24 LTS y npm 11.
- Docker con Compose para MySQL local y pruebas de integración. No se necesita Docker en Hostinger ni en las computadoras de los usuarios finales.
- Alternativamente, MySQL 8 o MariaDB 11.8.9 con una base propia y permisos para crear tablas e índices.

## Inicio local

Desde la raíz del repositorio:

```sh
npm ci
npm run env:local
npm run db:up
npm run db:migrate
npm run db:check
npm run admin:create
npm run dev
```

`env:local` crea un `.env` ignorado por Git, con contraseñas aleatorias exclusivamente para el MySQL local. Si el archivo ya existe, lo conserva. No ejecutar este comando para configurar producción: allí se utilizan las variables del alojamiento.

La interfaz de desarrollo se abre en el puerto **5173**. La API utiliza el **3000** y MySQL local el **3307**; se pueden cambiar en `.env`. Vite envía `/api` a Express.

`admin:create` solicita nombre, correo y contraseña oculta de la primera cuenta. No hay claves predeterminadas y no se modifican usuarios existentes. Ingresar con esos datos y usar **Verificar conexión** desde Inicio o Estado del sistema. Los puertos de la interfaz y de la API pueden necesitar reenvío si se trabaja en una máquina remota.

Para usar una base propia, copiar `.env.example` a `.env` y completar las variables DB antes de migrar. No ejecutar `db:up` en ese caso. No usar una base que comparta datos con otra aplicación.

## Comprobaciones

```sh
npm run check
npm run test:integration
npm run test:integration:mariadb
```

- `check`: TypeScript, pruebas de acceso y HTTP, y construcción completa.
- `test:integration`: inicia otro contenedor MySQL con base, puerto y credenciales efímeros; aplica migraciones y comprueba relaciones, precisión, rollback y API. Elimina únicamente ese contenedor al terminar. No escribe en la base de desarrollo ni en producción.
- `db:check`: comprueba la conexión, versión, capitalización de tablas y cantidad de tablas de aplicación.
- `db:migrate`: aplica solo migraciones pendientes. No crea usuarios, comprobantes ni movimientos de ejemplo.
- `test:integration:mariadb`: ejecuta la integración aislada con MariaDB 11.8.9, la versión informada por Hostinger.

Se utiliza MySQL real; las pruebas de integración no lo sustituyen por SQLite ni por mocks. La ejecución debe fallar si no puede arrancar su base aislada.

## Construcción y arranque de producción

```sh
npm run build
npm run db:migrate:prod
npm run db:check:prod
npm run admin:create:prod
npm start
```

Antes de iniciar, configurar `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT` y las variables DB. En este modo Express sirve el frontend compilado y `/api` desde el mismo proceso. Vite no corre en producción. Más detalles en [Hostinger](docs/hostinger.md).

## Organización

| Directorio | Contenido |
|---|---|
| `apps/web` | Interfaz React y cliente HTTP |
| `apps/api` | Express, configuración y acceso a datos |
| `packages/shared` | Contratos HTTP y tipos compartidos |
| `database/migrations` | SQL versionado e historial de generación |
| `tests` | Pruebas HTTP e integración |
| `scripts` | Configuración local y ejecución de integración |
| `docs` | Arquitectura, alcance y despliegue |

Ver [etapa 1](docs/etapa-1.md), [etapa 2 y primera cuenta](docs/etapa-2.md), [etapa 3 y prueba de ABM](docs/etapa-3.md), [arquitectura](docs/arquitectura.md) y [modelo de datos](docs/modelo.md).

Para detener MySQL sin borrar sus datos: `npm run db:stop`. Para detener el desarrollo: Ctrl+C. No borrar el volumen de MySQL para solucionar errores de migración sobre una base con datos.
