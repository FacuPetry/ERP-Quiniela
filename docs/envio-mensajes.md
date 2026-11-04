# Envío de mensajes — plantillas personales y WhatsApp manual

CLI-01, revisión 03/11/2026. Los informes pendientes siguen en pausa. El módulo prepara texto, permite copiarlo y abre un chat con el mensaje escrito; **el usuario confirma el envío dentro de WhatsApp**. No integra API oficial, envíos automáticos, masivos/programados, proveedores pagos ni registro de entregas.

## Funcionamiento

**Notificaciones → Envío de mensajes** reutiliza el SF de clientes, TextArea, DropDown, AmountBox, TextBox, botones y estilos existentes. La categoría participa del mismo acordeón y solo aparece si hay alguna opción autorizada.

Al ingresar se carga la plantilla del usuario autenticado. Elegir un cliente válido consulta el saldo real y muestra saldo firmado, fecha de corte, teléfono y vista previa. Escribir un código/nombre sin resolver el SF no consulta el saldo. Se admiten clientes inactivos con movimientos históricos, igual que en el Resumen.

Cambiar/limpiar el cliente descarta el resultado anterior y cancela peticiones pendientes; una respuesta tardía no puede reponer el mensaje de otro cliente. **Actualizar mensaje** vuelve a consultar saldos y teléfono. Un error de actualización retira el resultado anterior. Editar la plantilla reemplaza variables sobre los datos ya consultados, sin repetir consultas financieras por cada tecla.

## Plantilla guardada por usuario

**Texto del mensaje** es editable y admite hasta 2.000 caracteres, saltos de línea y variables. El DropDown **Variable disponible** y el botón **Insertar variable** agregan el marcador en la posición del cursor o reemplazan el texto seleccionado. No se evalúa código ni HTML; el reemplazo es literal y no recursivo.

| Variable | Valor |
|---|---|
| `{NombreCliente}` | Nombre del maestro, normalizando espacios. |
| `{MontoTotal}` | Saldo total con moneda, miles, coma y dos decimales; conserva el signo: `$150.000,00`, `-$150.000,00` o `$0,00`. |
| `{FechaSaldo}` | Fecha de corte dd/MM/yyyy. |
| `{ResumenSaldo}` | Frase que distingue pendiente de pago por el cliente, saldo a su favor y saldo neto cero. |

El mensaje predeterminado es `Hola, {NombreCliente}. Desde la agencia de quiniela te informamos que {ResumenSaldo}. Muchas gracias.` Conserva la redacción original según el signo del saldo. Un texto personalizado se respeta literalmente; se recomienda `{ResumenSaldo}` para evitar llamar deuda a un saldo a favor. La pantalla muestra siempre la interpretación del neto.

**Guardar mensaje** persiste la plantilla con sus marcadores, nunca el texto ya resuelto de un cliente. Se recupera al volver a entrar o desde otro dispositivo con la misma cuenta. No cambia las plantillas de otros usuarios, claves, permisos ni sesiones. **Cargar mensaje guardado** descarta el borrador y vuelve a leerlo; **Usar mensaje predeterminado** coloca el texto base como borrador y requiere Guardar para persistir la restauración. Un aviso indica cambios sin guardar. Un conflicto entre sesiones no sobrescribe silenciosamente el texto guardado.

Las variables desconocidas, las llaves incompletas y el texto vacío se señalan antes de guardar/copiar/abrir WhatsApp. Se limita también el resultado a 6.000 caracteres para evitar expansiones excesivas por variables repetidas. No se cambian importes para corregir una plantilla.

## Saldo compartido con el Resumen

Se mantiene `readLedgerBalance`, la misma consulta de totales del Resumen, sin modificar fórmulas ni SQL financieros. La vista previa usa **SaldoFinal** hasta el día actual de Argentina: incluye el saldo anterior, excluye posteriores/anulados y conserva originales revertidos junto con sus contrapartidas. No suma otra vez afectaciones ni medios de pago. Nombre, saldo, teléfono y plantilla se leen dentro del mismo snapshot de solo lectura.

Para comparar con el KPI **Saldo total** del Resumen, usar el mismo cliente y **Fecha hasta igual a Saldo hasta** del módulo. Desde distribuye saldo anterior y movimientos, sin eliminar el saldo anterior del KPI. Un Hasta histórico puede dar otro importe legítimamente. Se utilizan los estados vigentes; no se reconstruyen estados históricos.

Positivo significa neto a pagar por el cliente; negativo, neto a su favor. Cero no prueba que todos los documentos estén cancelados: pueden existir deudas y premios compensados en el neto. Los importes siguen siendo decimales exactos, sin Number ni redondeo binario. La vista previa en el navegador solo sustituye variables provistas por el backend; no calcula el saldo.

## Copiar y abrir WhatsApp

**Copiar mensaje** copia exactamente la vista previa, incluido el borrador personalizado aunque aún no se haya guardado. Si falla el portapapeles, se informa el fallo y se selecciona el texto para copiarlo manualmente. El portapapeles automático necesita un contexto seguro, como HTTPS.

**Abrir WhatsApp** utiliza `https://wa.me/<número>?text=<mensaje codificado>`, en una pestaña nueva, sin acceso a la ventana de origen. WhatsApp decide si abre Web o la aplicación según el dispositivo. No se presiona Enviar, no se registra una entrega y no se solicita ninguna API paga.

El teléfono se toma del maestro y se valida con libphonenumber-js en el backend. Para formatos locales se utiliza Argentina; no se inventa el código de área ni se toman extensiones o el primero de varios números. Ejemplos admitidos: `+54 9 11 1234-5678`, `005491112345678`, `5491112345678` y `011 15-1234-5678`. Un teléfono fijo completo puede ser válido: no se agrega un 9 indiscriminadamente. Para otros países debe incluirse el prefijo internacional con +. Se muestra el número normalizado antes de abrir el chat.

El dato original no se modifica. Si falta o es inválido, Abrir WhatsApp queda deshabilitado con una explicación; copiar sigue disponible. La validación del formato no confirma que exista una cuenta de WhatsApp en ese número. La titularidad/contacto y el envío final deben revisarse en WhatsApp. Las políticas del canal siguen aplicándose; no se incorpora una automatización para eludirlas.

## Permisos, API y persistencia

- Se conserva la clave `envio-mensajes`; solo cambia su categoría a **Notificaciones**. Los permisos existentes continúan funcionando. Administrador accede automáticamente; otros usuarios requieren **Usuarios → Acceso al menú → Notificaciones → Envío de mensajes → Consulta**.
- Consulta habilita preparar/copiar/abrir chat y guardar **su propia preferencia**, sin conceder escrituras financieras ni acceso a otros ABM/Informes. El SF auxiliar sigue proyectando Código, Nombre y Activo si no hay permiso del maestro.
- `GET /api/mensajes/plantilla`: devuelve la plantilla propia o null para el predeterminado, y versión.
- `PUT /api/mensajes/plantilla`: recibe únicamente `{ Plantilla: string | null }`. Requiere sesión, permiso, petición de aplicación, CSRF e If-Match. El usuario se obtiene de la sesión; no se admite un Usuario en el cuerpo. Versión desactualizada devuelve 409.
- `GET /api/mensajes/vista-previa?Cliente=...`: datos reales, variables, mensaje con plantilla guardada y teléfono/validación. No permite aportar saldo o fecha de corte. Respuestas sin caché. No existe endpoint de envío.
- Única adición de esquema: **USUARIO.MensajeSaldoPlantilla**, TEXT nullable. No se agrega ninguna tabla, FK ni datos obligatorios. Los usuarios existentes conservan null y la redacción predeterminada. Los errores técnicos no registran plantillas, mensajes o saldos.

## Publicación

Aplicar **0010_mensaje_saldo_plantilla** antes de probar el módulo, con el procedimiento habitual y la aplicación detenida:

```sh
npm run db:migrate:prod
npm run db:check:prod
```

La migración agrega una columna opcional sin alterar usuarios ni movimientos existentes. El check detecta si falta. No se requieren credenciales ni configuración de WhatsApp/SMS. El catálogo y el renderizado compartidos permiten añadir variables; futuros transportes, lotes y programación seguirán requiriendo su propia definición y no se implementan anticipadamente.

## Archivos principales

- `packages/shared/src/messages.ts`: catálogo, validación, renderizado y enlace seguro; contrato de preferencias/vista previa.
- `apps/api/src/messages/{routes,store,text,phone}.ts`: persistencia personal, seguridad, datos reales, signo y teléfono.
- `apps/web/src/components/messages/{MessagesPage,MessageTemplateEditor}.tsx`, `messages.css` y `services/messages.ts`: editor, vista previa, guardado y acciones.
- `navigation.ts`, `Workspace.tsx`, `UsersPage.tsx` y catálogo de permisos: Notificaciones, misma clave de acceso.
- `database/schema.ts`, `database/check.ts`, migración 0010, journal/snapshot: columna opcional y comprobación.
- `apps/api/package.json` y lock: libphonenumber-js, exclusivamente en backend.
- Pruebas unitarias/integración, README y roadmap: reglas y alcance actualizado.

## Qué probar

1. Entrar desde Notificaciones. Solo una categoría abierta y permisos conservados. Sin selección válida no debe consultarse saldo ni generarse un mensaje de cliente.
2. Escribir una plantilla con NombreCliente/MontoTotal; insertar variables en el medio y sobre una selección. Verificar que la vista previa cambie sin nuevas consultas por tecla. Probar llaves incompletas, variable inexistente, vacío y límites.
3. Guardar, recargar y entrar desde otro dispositivo: misma plantilla. Otro usuario conserva la suya. Probar Cargar guardado, restaurar predeterminado y conflicto entre dos sesiones.
4. Comparar el saldo con el Resumen usando el mismo Hasta. Probar positivo/negativo/cero, centavos y fechas. MontoTotal mantiene el signo; ResumenSaldo adapta la frase.
5. Copiar y abrir WhatsApp: texto y contacto idénticos, incluidos saltos, acentos, emojis y signos. El botón Enviar se presiona manualmente en WhatsApp. Probar número internacional, argentino local, ausente, inválido, sin área, con extensión y con varios números.
6. Cambiar/limpiar cliente durante consulta y actualizar después de un movimiento; no debe quedar un mensaje previo incorrecto. Revisar escritorio/móvil y el caso de portapapeles denegado.
7. Sin permiso, pantalla y API bloqueadas. Usuario con solo Consulta de Mensajes puede guardar su preferencia sin acceder a datos de otros usuarios ni modificar operaciones financieras.

## Verificación

Tipos de los workspaces y **64 pruebas unitarias** aprobados. Las suites completas pasaron con **198 pruebas en MySQL 8.4 y 198 en MariaDB 11.8.9**, sobre bases efímeras; la revisión final del manejo de plantillas extensas se volvió a comprobar con los 17 casos del mayor/mensajes en MariaDB. Se verificaron migraciones, preservación de operaciones, saldo compartido, plantillas separadas por usuario, persistencia, CSRF, versiones, permisos, valores negativos, teléfono y consultas sin escrituras financieras.

Chromium en escritorio y móvil, con API y destino WhatsApp simulados: categoría/acordeón, inserción al cursor, edición, vista previa, guardado/recarga/restauración/conflicto, variables inválidas, copia y enlace con contacto/texto exactos, ausencia de teléfono, teléfono inválido y descarte de respuestas tardías. No se contactaron destinatarios ni servicios de envío, ni se usaron datos o credenciales de Hostinger.
