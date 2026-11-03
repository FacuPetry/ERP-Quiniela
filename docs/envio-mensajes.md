# Envío de mensajes — preparación y copia individual

Entrega de CLI-01, 03/11/2026. Los informes todavía pendientes quedan en pausa hasta nuevo aviso. Este módulo no envía mensajes, no contacta proveedores y no incorpora tablas, migraciones, credenciales, tareas programadas ni historial de entregas.

## Funcionamiento

Operaciones → **Envío de mensajes** reutiliza ClientSearch/SF, TextArea, AmountBox, TextBox y los estilos del sistema. Al seleccionar un cliente válido consulta el backend y genera automáticamente la vista previa. Escribir un nombre/código sin resolver el SF no genera mensajes. Permite consultar clientes inactivos, igual que el Resumen, porque pueden conservar saldo.

Se muestran el saldo neto firmado, su fecha de corte y la hora de consulta. **Actualizar mensaje** vuelve a consultar la base; no copia ni envía. Cambiar, editar o limpiar el SF descarta el mensaje anterior y cancela la petición pendiente; una respuesta tardía no puede reponer el saldo de otro cliente. Un error de actualización deja la copia anterior fuera de la pantalla.

**Copiar mensaje** copia exactamente el texto visible, de solo lectura. El usuario decide después si lo pega y envía desde WhatsApp. No se abre un chat ni se registra un envío. Si el navegador no permite utilizar el portapapeles, se informa el fallo y se selecciona el texto para copiarlo manualmente; no se muestra un éxito ficticio. El portapapeles automático necesita un contexto seguro, como HTTPS del despliegue habitual.

## Saldo y redacción

La consulta `readLedgerBalance` se extrajo del Resumen sin cambiar su SQL ni criterios. El mayor y Mensajes llaman a la misma función. La vista previa usa **SaldoFinal** hasta la fecha civil actual de Argentina: incluye el saldo anterior y los asientos hasta ese día, excluye los posteriores y los anulados, y conserva originales revertidos junto con sus contrapartidas. No suma nuevamente afectaciones o medios de pago. Nombre y saldo se leen dentro del mismo snapshot REPEATABLE READ de solo lectura.

Para comparar con el KPI **Saldo total** del Resumen: elegir el mismo cliente y **Fecha hasta igual a Saldo hasta** del módulo Mensajes. El Desde del informe solo distribuye el saldo anterior y los movimientos del período; no elimina el saldo anterior del KPI. Un Resumen con un Hasta histórico puede dar otro importe legítimamente. Se utilizan los estados vigentes, igual que en el informe; no se reconstruyen estados históricos.

| Saldo total | Interpretación y texto |
|---|---|
| Positivo | Neto a pagar por el cliente: «Hola, Ana. Desde la agencia de quiniela te informamos que tu saldo pendiente de pago al 03/11/2026 es de $150.000,00. Muchas gracias.» |
| Negativo | Saldo a favor del cliente: se informa su valor absoluto, sin llamarlo deuda ni pedirle un pago. |
| Cero | Se informa saldo **neto** de Cuenta corriente de $0,00. No se afirma que todos los documentos estén cancelados: puede haber deudas y premios compensados en el neto. |

Se conserva el nombre completo del maestro, normalizando espacios para el saludo. El mensaje fijo agrega la fecha de corte para identificar cuándo fue calculado. Los importes se mantienen como cadenas decimales exactas y se presentan con miles/coma/dos decimales de Argentina, sin Number ni redondeo binario.

## Acceso y API

- Nuevo permiso independiente `envio-mensajes`, en Operaciones. El Administrador accede automáticamente; para los demás, habilitar **Usuarios → Acceso al menú → Operaciones → Envío de mensajes → Consulta**. No se concede automáticamente a cuentas anteriores.
- Solo admite Consulta. Preparar/copiar no escribe ni exige permisos de Cuenta corriente, Informes, Clientes o Caja. Su SF puede consultar únicamente la referencia de clientes con Código, Nombre y Activo si no tiene acceso al maestro.
- `GET /api/mensajes/vista-previa?Cliente=...`: requiere sesión y permiso, devuelve `BalanceMessagePreview` y no permite aportar importes, mensajes o fechas de corte desde el navegador. Devuelve 400 por selección inválida, 404 por cliente inexistente, 401 por sesión ausente/revocada y 403 por falta de acceso. Respuestas sin caché.
- No hay endpoint de envío ni de escritura. Los errores técnicos registran una referencia y código, sin guardar el saldo o el texto en logs. Copiar no prueba consentimiento ni entrega; esos requisitos se definirán antes de integrar un canal.

## Estructura para próximas entregas

Consulta financiera, composición del texto, contrato HTTP y vista están separados. Un futuro transporte WhatsApp/SMS podrá consumir el mismo contenido; lotes, programación, consentimiento, plantillas configurables y registro de entregas siguen pendientes y requerirán su propia definición. No se agregan anticipadamente servicios o tablas para esas funciones.

## Archivos de la entrega

- `apps/api/src/messages/{routes,store,text}.ts`: endpoint, snapshot y mensaje independiente del canal.
- `apps/api/src/reports/ledger.ts`: función común de totales, sin cambios de fórmula/SQL.
- `apps/api/src/{app,server}.ts`: registro del módulo.
- `apps/api/src/{references,users}/routes.ts`: SF auxiliar y permiso de consulta.
- `packages/shared/src/{messages,permissions,index}.ts`: contrato y catálogo de menú.
- `apps/web/src/components/messages/{MessagesPage.tsx,messages.css}` y `services/messages.ts`: pantalla, interacción y consulta.
- `apps/web/src/{navigation.ts,components/Workspace.tsx,components/Icon.tsx,components/users/UsersPage.tsx}`: navegación, íconos y acceso configurable.
- `tests/messages.test.ts`, `tests/integration/account-ledger.test.ts`: signos, precisión, fecha argentina, coincidencia con el Resumen y seguridad.
- README, roadmap y esta guía: alcance vigente, pausa de informes y pendientes futuros.

## Aceptación

1. Como administrador entrar desde Operaciones. Sin cliente, no debe haber consulta de saldo ni mensaje. Resolver un cliente con SF: debe aparecer nombre, importe, fecha y mensaje. Probar búsqueda sin coincidencias y selección desde el listado base del SF.
2. Comparar Saldo total con el Resumen usando ese cliente y el mismo Hasta. Probar cobros/pagos parciales, múltiples afectaciones y medios, anticipos, anulaciones y reversos. Los posteriores a Saldo hasta no forman parte de ese neto.
3. Probar saldo positivo, negativo y cero; verificar que solo el positivo se describa como pendiente de pago y el negativo como saldo a favor. Incluir centavos e importes grandes.
4. Copiar y pegar en WhatsApp o un editor: texto idéntico a la vista previa. Nada debe enviarse desde el ERP. Probar también el caso de portapapeles denegado y la copia manual.
5. Cambiar/limpiar cliente durante una consulta, actualizar luego de un cambio de saldo y provocar un fallo de conexión: no debe quedar disponible un mensaje anterior incorrecto. Revisar escritorio y móvil, sin desplazamiento horizontal de la página.
6. Habilitar solo Consulta de Envío de mensajes a un usuario: debe poder resolver clientes/preparar/copiar, pero no entrar a los ABM ni Informes sin sus permisos. Sin ese permiso debe bloquearse la pantalla y la API. Modificar permisos revoca las sesiones como en el circuito de Usuarios existente.

La publicación usa el despliegue habitual; no requiere comandos adicionales de base de datos ni claves de WhatsApp/SMS.

## Verificación de la entrega

- Tipos de API, web y paquete compartido correctos; 61 pruebas unitarias aprobadas.
- Integración completa: **197 pruebas aprobadas en MySQL 8.4 y 197 en MariaDB 11.8.9**, con bases y contenedores efímeros. Incluye la coincidencia de Mensajes con el Resumen sobre circuitos reales, reglas de signos, posteriores separados, autorización/SF, revocación de sesiones y ausencia de escrituras financieras al consultar.
- Chromium en escritorio y móvil con API simulada: SF/listado base, selección válida, importes positivo/negativo/cero, copia exacta al portapapeles y selección manual si falla, error/reintento, limpieza, respuesta tardía descartada, sesión expirada y pantalla sin permiso. Sin envíos ni peticiones de escritura.
- No se utilizaron datos ni credenciales de Hostinger; no se incorporó una migración ni se ejecutó una compilación de producción para esta entrega.
