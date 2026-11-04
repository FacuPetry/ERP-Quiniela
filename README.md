# ERP-Quiniela

Aplicación de cuenta corriente y tesorería. Desarrollo incremental: cada etapa se implementa, se comprueba y se revisa antes de continuar.

Ver [alcance de la primera versión y mejoras pendientes](docs/entregas-y-pendientes.md): operatoria básica implementada, límites actuales, comprobación de aceptación y próximas entregas de estética e informes. Los cheques propios quedan fuera del alcance inicial del cliente.

## Entrega en revisión — Mensajes para varios clientes

Notificaciones → Envío de mensajes agrega la ficha **Varios clientes**, con filtros de tipo/estado/saldo, selección por CheckBox entre páginas, consulta actualizada de elegidos y acciones individuales Copiar/Abrir WhatsApp. Reutiliza plantilla, saldo del mayor y permisos actuales; no agrega migraciones ni envíos automáticos. Conserva la consulta individual mediante SF y la configuración de la plantilla personal con variables. Ofrece Copiar mensaje y Abrir WhatsApp con teléfono validado y texto preparado; el envío se confirma dentro de WhatsApp. Conserva el permiso independiente de consulta. La plantilla personal utiliza la migración **0010_mensaje_saldo_plantilla**, ya integrada. Los informes pendientes quedan en pausa. Ver [alcance y pruebas](docs/envio-mensajes.md).

## Importes y panel de Cajas

AmountBox conserva formato/cursor al hacer clic y selecciona todo con Tab/Shift+Tab. Mientras se escribe o pega mantiene el texto sin reformatearlo; únicamente al salir valida, aplica la máscara y convierte el vacío o inválido en cero. Conserva la precisión decimal y las validaciones financieras del módulo. Administrar cajas reinicia el saldo inicial al abrir/cambiar Caja y presenta el resultado del último cierre al final del panel. Sin cambios de API o base de datos. Ver [alcance y prueba](docs/importes-foco-y-cajas.md).

## Detalle de jornada y PDF

INF-09 agrega el detalle de una apertura real con acumulado de efectivo, movimientos válidos, medios no físicos informativos y cierre guardado. La base de Informes exporta todas sus filas, saldos, cortes y totales a PDF, con páginas y fuentes locales; se imprime el mismo archivo desde el visor. Cerrar caja y emitir informe confirma el cierre existente y luego genera el PDF de esa apertura; el cierre se conserva si falla la emisión. Nuevo permiso independiente de consulta; sin migraciones. Ver [alcance, archivos y pruebas](docs/detalle-jornada-exportacion-pdf.md).

## Cheques de terceros

Nuevo informe de estado actual y vencimientos, una fila por cheque recibido, filtros por estado/banco/cliente/fechas, subtotales por estado y total nominal, sin propios ni recepciones anuladas. Propiedades consulta eventos vigentes sin modificar Valores. Reutiliza la base de Informes y agrega permiso independiente de consulta; sin migraciones. Ver [alcance y prueba](docs/informe-cheques-terceros.md). El roadmap distingue los pedidos explícitos CLI-01 (mensajes de saldos, con preparación/copia individual en la entrega actual) y CLI-02 (control de Caja) de las propuestas futuras.

## Filtros y subtotales

Cobros y pagos incorpora Caja como filtro editable/limpiable, sugerido desde la caja operativa y sin limitar la consulta a su jornada abierta. Las parejas de fechas sugieren hoy menos 30 días y hoy en toda la aplicación. Los informes vacíos mantienen encabezados y totales sin mensajes de detalle. Resumen diario agrupa por caja con subtotales calculados en servidor y Total general, sin sumar saldos trasladados. Sin migraciones ni cambios de registración financiera. Ver [alcance, archivos y pruebas](docs/filtros-caja-agrupamiento-informes.md).

## Resumen diario de caja

Se agrega un informe por jornada real de caja con efectivo ingresado/entregado, cierres guardados, contado, diferencias y Propiedades. Permiso independiente de consulta; sin nuevas migraciones. Cuenta corriente simplifica columnas y agrega Total general al Listado, conservando cálculos y KPI del Resumen. Ver [alcance, archivos y pruebas](docs/resumen-diario-caja.md). Cheques de terceros se incorpora en la entrega actual; bancos continúa pendiente.

## Listado y Resumen de Cuenta corriente

El Listado de saldos incorpora Tipo de cliente y Cliente opcional, sin KPI. El Resumen es un mayor de cliente obligatorio con fechas, Saldo anterior, movimientos del período y Saldo a vencer por fecha de origen, sin anulados. Ambos informes tienen scroll continuo sin páginas, encabezados/totales en verde suave y trazabilidad de afectaciones/valores. El menú funciona como acordeón exclusivo con submenús indentados. El Listado conserva el permiso anterior; el Resumen tiene uno nuevo. No requiere migraciones. Ver [convención financiera, permisos y pruebas](docs/listado-resumen-cuenta-corriente.md) y los [criterios generales para informes futuros](docs/criterios-informes.md).

## Filtros, Informes y menú por categorías

Usuarios utiliza el modal estándar de filtros. El Resumen de Cuenta corriente compone una nueva base reutilizable de Informes, con filtros iniciales, Cliente mediante SF y tabla sin líneas divisorias. El menú agrupa las opciones por categorías desplegables y ajusta los nombres largos al espacio disponible. No requiere nuevas migraciones. Ver [comportamiento y pruebas](docs/filtros-informes-menu.md).

## Usuarios e informe de Cuenta corriente

Incluye permisos individuales por menú (sin perfiles predefinidos en la interfaz), administración de contraseñas exclusivamente por el administrador y el primer informe de saldos actuales por cliente. Los permisos se aplican también en la API. Corrige el login móvil, elimina referencias a etapas de las pantallas y unifica los toolbars de los ABM. Requiere la migración **0009_permisos_usuarios**. Ver [alcance, publicación y prueba completa](docs/usuarios-permisos-resumen.md).

## Base funcional — Cuenta corriente, caja, Tesorería y Valores

Incluye React + TypeScript + Vite + Tailwind, API Express, conexión MySQL/MariaDB, esquema Drizzle y migraciones de las **21 tablas, sin historial de consumos de numeradores**. Dispone de acceso de usuarios, sesiones persistentes, menú adaptable y ABM de tipos de cliente, clientes, conceptos, cajas, bancos, cuentas bancarias, comprobantes y numeración por comprobante. Comprobantes y Numerador son ABM independientes. Cuenta corriente permite registrar deudas/créditos, consultar saldos separados y anular movimientos, con SF para seleccionar clientes y numeración `0000-00000000` mediante un único BIGINT. Los comprobantes pueden compartir un Numerador configurado en su maestro. La numeración válida se sugiere automáticamente y puede editarse en las altas normales; sin configuración válida se permite carga manual. Asociar o editar numeradores no consulta máximos históricos. Los movimientos conservan su BIGINT sin FK al Numerador. La revisión requiere la [migración segura de numeración](docs/numeracion-comprobantes.md). Cobros/pagos ya incluye valores, afectaciones, cajas y reversiones; Tesorería permite registrar ingresos y retiros internos de efectivo sin afectar Cuenta corriente, con anulación de la apertura vigente y reversión histórica. Valores centraliza la consulta de cheques propios, de terceros y transferencias, con filtros, Propiedades, historial y operaciones relacionadas. Permite depositar cheques de terceros en cartera y confirmar su acreditación real, con selección múltiple, historial, auditoría e idempotencia, sin requerir caja abierta. El depósito no acredita fondos; la acreditación genera un único ingreso bancario por cheque en la cuenta de su depósito, sin volver a afectar Cuenta corriente. Ver [etapa 8 y pruebas](docs/etapa-8.md). El rechazo de terceros depositados/acreditados genera una deuda vinculada al evento y, si corresponde, el débito bancario confirmado; conserva el Recibo y compensa su anticipo disponible. Esta entrega requiere la migración 0008. El rechazo de endosados, las devoluciones posteriores, el débito de cheques propios y los traspasos siguen pendientes. Ver [etapa 7 y pruebas](docs/etapa-7.md). Ver [etapa 6 y prueba completa](docs/etapa-6.md). Ver [etapa 4](docs/etapa-4.md), [etapa 5 y pruebas](docs/etapa-5.md) y [ajustes de Cuenta corriente y SF](docs/cuenta-corriente-presentacion-sf.md).

Los maestros utilizan selección de fila sin radio visible, acciones con íconos, búsqueda y filtros en ventana, combos activos sin buscador y formularios con Guardar/Cancelar en el encabezado. El alta de clientes muestra un código sugerido; el definitivo se asigna con cinco dígitos al guardar, sin tabla adicional. Ver [componentes y correlativo](docs/ajustes-componentes.md), incluidas la conservación de selección, los códigos anteriores y la posible reutilización del último eliminado.

Todos los ABM utilizan la biblioteca propia de TextBox, TextArea, DropDown y CheckBox, con labels, ayuda y errores compartidos. Ver [controles base y pruebas por componente](docs/controles-base.md). SF permite buscar y seleccionar registros; DatePicker admite escritura manual y calendario, y AmountBox centraliza la entrada y presentación de importes. Ver [valores iniciales y filtros](docs/valores-iniciales-abm.md), [formatos y pruebas](docs/controles-fechas-importes.md) y [foco y Safari móvil](docs/foco-controles-safari.md). IDTabla se conserva exclusivamente interno y no se presenta en los ABM.

Los listados incluyen **Propiedades** del registro seleccionado mediante un OffCanvas compartido, superpuesto y de solo lectura, con información configurable por módulo y carga al abrir. Ver [uso y extensión del panel lateral](docs/offcanvas-propiedades.md).

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
- `db:numbering:check`: comprueba compatibilidad con la migración de numeración sin modificar datos. En Hostinger: `db:numbering:check:prod`.
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

Ver [etapa 1](docs/etapa-1.md), [etapa 2 y primera cuenta](docs/etapa-2.md), [etapa 3 y prueba de ABM](docs/etapa-3.md), [etapa 4: comprobantes y numeración](docs/etapa-4.md), [etapa 5: Cuenta corriente y SF](docs/etapa-5.md), [arquitectura](docs/arquitectura.md) y [modelo de datos](docs/modelo.md).

Para detener MySQL sin borrar sus datos: `npm run db:stop`. Para detener el desarrollo: Ctrl+C. No borrar el volumen de MySQL para solucionar errores de migración sobre una base con datos.
