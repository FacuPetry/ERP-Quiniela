# Envío de mensajes — consulta individual y varios clientes

CLI-01, revisión 04/11/2026. Los informes pendientes siguen en pausa. El módulo prepara texto, permite copiarlo y abre un chat con el mensaje escrito; **el usuario confirma el envío dentro de WhatsApp**. No integra API oficial, envíos automáticos, masivos/programados, proveedores pagos ni registro de entregas.

## Funcionamiento

**Notificaciones → Envío de mensajes** reutiliza el SF de clientes, TextArea, DropDown, AmountBox, TextBox, botones y estilos existentes. La categoría participa del mismo acordeón y solo aparece si hay alguna opción autorizada.

Al ingresar se carga la plantilla del usuario autenticado. Elegir un cliente válido consulta el saldo real y muestra saldo firmado, fecha de corte, teléfono y vista previa. Escribir un código/nombre sin resolver el SF no consulta el saldo. Se admiten clientes inactivos con movimientos históricos, igual que en el Resumen.

El formulario reutiliza **FormSections** con tres fichas: **Configurar mensaje** (plantilla, variables y guardado), **Envío de mensajes** (cliente, datos, vista previa y acciones) y **Varios clientes** (filtros, selección y acciones por cliente). Conserva la columna lateral, Sticky, selección automática por sección visible y navegación mediante scroll; en móvil utiliza la adaptación del componente base. Las secciones permanecen montadas, sin perder borradores al navegar.

Los campos Saldo total, Saldo hasta, Teléfono y Vista previa permanecen visibles sin cliente, con valores vacíos y las acciones de copia/WhatsApp deshabilitadas. Los espacios informativos tienen altura reservada para evitar saltos al seleccionar, actualizar o limpiar. No se conserva ni se muestra el resultado del cliente anterior para completar esa estructura.

Cambiar/limpiar el cliente descarta el resultado anterior y cancela peticiones pendientes; una respuesta tardía no puede reponer el mensaje de otro cliente. **Actualizar mensaje** vuelve a consultar saldos y teléfono. Un error de actualización retira el resultado anterior. Editar la plantilla reemplaza variables sobre los datos ya consultados, sin repetir consultas financieras por cada tecla.

## Varios clientes: preparación conjunta, envío manual individual

Se amplía el módulo existente con una tercera ficha en lugar de duplicar el menú, la configuración o los permisos. Reutiliza FormSections, DataTable con selección múltiple, ActionToolbar, FilterDialog, DropDown, Pagination y la presentación de tablas de Informes. No se agrega un informe ni se habilitan PDF/automatismos para mensajes.

**Filtrar clientes** abre el modal; no se consulta ningún cliente al entrar ni antes de aplicar los filtros. Se admiten tipo de cliente (incluidos tipos inactivos), búsqueda por código/nombre/fantasía, estado de los clientes y saldo neto. Por defecto: **clientes activos con neto positivo**. Se puede consultar neto distinto de cero, a favor, cero o todos. Es saldo neto, no pendiente documental: deudas y premios pueden compensarse en este importe sin cancelar sus documentos.

Cada fila muestra cliente, teléfono original, saldo firmado, vista previa y acciones individuales. La tabla tiene scroll interno, ordenamiento remoto y páginas de 20 clientes; filtros y orden se aplican sobre todos los resultados antes de paginar. El texto se acota visualmente con tooltip y puede leerse completo desde Propiedades, junto con teléfono normalizado/error. No se abre ningún chat al consultar o seleccionar filas.

Los CheckBox permiten elegir clientes de distintas páginas. **Seleccionar página** agrega solo la página visible y **Limpiar selección** desmarca los elegidos. **Consultar seleccionados** vuelve a leer los clientes elegidos y muestra únicamente esos registros, con sus saldos y teléfonos actuales. No reutiliza como saldo definitivo el dato de la selección ni aplica de nuevo los filtros de saldo/estado que podrían ocultar un elegido. Se admiten hasta 1.000 seleccionados por consulta, con aviso si se supera; nunca se recortan silenciosamente. Si un cliente dejó de existir, se pide repetir la consulta. **Volver a filtros** recupera la consulta anterior. Actualizar vuelve a leer los datos y limpia los CheckBox; volver a filtrar u ordenar también los limpia. La selección no se guarda al salir.

Se utiliza la misma plantilla personal que en el envío individual, incluyendo el borrador actual sin guardar. Cambiar el texto actualiza las vistas previas con las variables recibidas, sin consultar por cada tecla. Los errores de expansión se señalan por cliente y deshabilitan sus acciones; los demás clientes siguen disponibles. Un teléfono ausente/inválido impide Abrir WhatsApp pero permite Copiar mensaje. Si falla el portapapeles, se muestra el texto seleccionado para copiar manualmente. Consultas fallidas retiran los resultados anteriores y las respuestas tardías se descartan.

**Copiar mensaje** y **Abrir WhatsApp** se ejecutan únicamente sobre la fila elegida. No hay botón de envío conjunto, apertura automática de múltiples ventanas, registro de «enviado» ni servicios pagos. El usuario revisa y presiona Enviar en WhatsApp en cada caso; copiar/abrir no confirma la entrega.

## Plantilla guardada por usuario

**Texto del mensaje** es editable y admite hasta 2.000 caracteres, saltos de línea y variables. El DropDown **Variable disponible** y el botón **Insertar variable** agregan el marcador en la posición del cursor o reemplazan el texto seleccionado. No se evalúa código ni HTML; el reemplazo es literal y no recursivo.

| Variable | Valor |
|---|---|
| `{NombreCliente}` | Nombre del maestro, normalizando espacios. |
| `{NombreFantasia}` | Nombre de fantasía del cliente, normalizando espacios. Si falta o está vacío, se utiliza NombreCliente. |
| `{MontoTotal}` | Saldo total con moneda, miles, coma y dos decimales; conserva el signo: `$150.000,00`, `-$150.000,00` o `$0,00`. |
| `{FechaSaldo}` | Fecha de corte dd/MM/yyyy. |
| `{ResumenSaldo}` | Frase que distingue pendiente de pago por el cliente, saldo a su favor y saldo neto cero. |

El mensaje predeterminado es `Hola, {NombreCliente}. Desde la agencia de quiniela te informamos que {ResumenSaldo}. Muchas gracias.` Conserva la redacción original según el signo del saldo. Un texto personalizado se respeta literalmente; se recomienda `{ResumenSaldo}` para evitar llamar deuda a un saldo a favor. La pantalla muestra siempre la interpretación del neto.

**Guardar mensaje** persiste la plantilla con sus marcadores, nunca el texto ya resuelto de un cliente. Se recupera al volver a entrar o desde otro dispositivo con la misma cuenta. No cambia las plantillas de otros usuarios, claves, permisos ni sesiones. **Cargar mensaje guardado** descarta el borrador y vuelve a leerlo; **Usar mensaje predeterminado** coloca el texto base como borrador y requiere Guardar para persistir la restauración. Un aviso indica cambios sin guardar. Un conflicto entre sesiones no sobrescribe silenciosamente el texto guardado.

Las variables desconocidas, las llaves incompletas y el texto vacío se señalan antes de guardar/copiar/abrir WhatsApp. Se limita también el resultado a 6.000 caracteres para evitar expansiones excesivas por variables repetidas. No se cambian importes para corregir una plantilla.

## Saldo compartido con el Resumen

La consulta individual conserva `readLedgerBalance`. El lote reutiliza su fuente `ledgerEntries`: una fila monetaria por asiento y las mismas expresiones de débito/crédito y vigencia del Resumen. Solo se expone la clave de cliente para agrupar; no cambian las fórmulas financieras. La vista previa usa **SaldoFinal** hasta el día actual de Argentina: incluye el saldo anterior, excluye posteriores/anulados y conserva originales revertidos junto con sus contrapartidas. No suma otra vez afectaciones ni medios de pago. Nombre, saldo, teléfono y plantilla se leen dentro del mismo snapshot de solo lectura. El lote suma en MySQL con DECIMAL antes de aplicar filtros de saldo y paginación; no multiplica importes por afectaciones/valores ni calcula dinero en JavaScript.

Para comparar con el KPI **Saldo total** del Resumen, usar el mismo cliente y **Fecha hasta igual a Saldo hasta** del módulo. Desde distribuye saldo anterior y movimientos, sin eliminar el saldo anterior del KPI. Un Hasta histórico puede dar otro importe legítimamente. Se utilizan los estados vigentes; no se reconstruyen estados históricos.

Positivo significa neto a pagar por el cliente; negativo, neto a su favor. Cero no prueba que todos los documentos estén cancelados: pueden existir deudas y premios compensados en el neto. Los importes siguen siendo decimales exactos, sin Number ni redondeo binario. La vista previa en el navegador solo sustituye variables provistas por el backend; no calcula el saldo.

## Copiar y abrir WhatsApp

**Copiar mensaje** copia exactamente la vista previa, incluido el borrador personalizado aunque aún no se haya guardado. Si falla el portapapeles, se informa el fallo y se selecciona el texto para copiarlo manualmente. El portapapeles automático necesita un contexto seguro, como HTTPS.

**Abrir WhatsApp** utiliza `https://wa.me/<número>?text=<mensaje codificado>`, en una pestaña nueva, sin acceso a la ventana de origen. WhatsApp decide si abre Web o la aplicación según el dispositivo. No se presiona Enviar, no se registra una entrega y no se solicita ninguna API paga.

El teléfono se toma del maestro y se valida con libphonenumber-js en el backend. Para formatos locales se utiliza Argentina; no se inventa el código de área ni se toman extensiones o el primero de varios números. Se adapta específicamente la salida argentina al formato de WhatsApp: **54 + 9 + código de área + número**, sin el 0 de acceso nacional ni el 15. Si el 9 ya existe, no se duplica. Para otros países se conserva el formato internacional validado con su código de país.

La causa de la omisión del 9 era que libphonenumber interpreta `11 1234-5678`, sin 15, como una línea fija y genera +54 11. Esa interpretación general no se utiliza directamente como identificador de WhatsApp: se normaliza la salida argentina y se vuelve a validar. Este ajuste solo corresponde al enlace; no redefine el tipo de teléfono ni modifica el maestro.

WhatsApp lo especifica en [Formato internacional de número de teléfono](https://faq.whatsapp.com/1294841057948784): Argentina requiere el 9 entre país y área y quitar el 15. Su [guía de clic para chatear](https://faq.whatsapp.com/5913398998672934) pide el número internacional sin +, guiones ni paréntesis en la ruta wa.me.

| Teléfono guardado | Número del enlace |
|---|---|
| `(11) 1234-5678`, `011 1234-5678`, `011 15-1234-5678` | `5491112345678` |
| `+54 11 1234-5678`, `+54 9 11 1234-5678`, `005491112345678` | `5491112345678` |
| `(341) 2345678`, `0341 15 2345678` | `5493412345678` |
| `+1 202 555 0123` | `12025550123` |

Se muestra el número normalizado antes de abrir el chat. En Clientes se agrega una ayuda al campo Teléfono recomendando código de área sin 0, sin 15 y número; por ejemplo `(11) 1234-5678`. Los formatos anteriores con 0/15 se siguen aceptando al generar el enlace. Un número incompleto, como `11 1234567` (siete cifras después del área 11), sigue siendo inválido: no se completan dígitos automáticamente.

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

1. Entrar desde Notificaciones. Revisar Configurar mensaje y Envío de mensajes mediante Tabs y scroll, el resaltado automático y Sticky, también en móvil. Sin cliente, los campos deben estar visibles y vacíos y las acciones deshabilitadas; no debe consultarse saldo. Seleccionar y limpiar debe conservar la distribución sin retener datos previos.
2. Escribir una plantilla con NombreCliente/MontoTotal; insertar variables en el medio y sobre una selección. Verificar que la vista previa cambie sin nuevas consultas por tecla. Probar llaves incompletas, variable inexistente, vacío y límites.
3. Guardar, recargar y entrar desde otro dispositivo: misma plantilla. Otro usuario conserva la suya. Probar Cargar guardado, restaurar predeterminado y conflicto entre dos sesiones.
4. Comparar el saldo con el Resumen usando el mismo Hasta. Probar positivo/negativo/cero, centavos y fechas. MontoTotal mantiene el signo; ResumenSaldo adapta la frase.
5. Copiar y abrir WhatsApp: texto y contacto idénticos, incluidos saltos, acentos, emojis y signos. El botón Enviar se presiona manualmente en WhatsApp. Probar número internacional, argentino local, ausente, inválido, sin área, con extensión y con varios números.
6. Cambiar/limpiar cliente durante consulta y actualizar después de un movimiento; no debe quedar un mensaje previo incorrecto. Revisar escritorio/móvil y el caso de portapapeles denegado.
7. Sin permiso, pantalla y API bloqueadas. Usuario con solo Consulta de Mensajes puede guardar su preferencia sin acceder a datos de otros usuarios ni modificar operaciones financieras.

## Verificación

Tipos de los workspaces y **64 pruebas unitarias** aprobados. Las suites completas pasaron con **198 pruebas en MySQL 8.4 y 198 en MariaDB 11.8.9**, sobre bases efímeras; la revisión final del manejo de plantillas extensas se volvió a comprobar con los 17 casos del mayor/mensajes en MariaDB. Se verificaron migraciones, preservación de operaciones, saldo compartido, plantillas separadas por usuario, persistencia, CSRF, versiones, permisos, valores negativos, teléfono y consultas sin escrituras financieras.

Chromium en escritorio y móvil, con API y destino WhatsApp simulados: categoría/acordeón, inserción al cursor, edición, vista previa, guardado/recarga/restauración/conflicto, variables inválidas, copia y enlace con contacto/texto exactos, ausencia de teléfono, teléfono inválido y descarte de respuestas tardías. No se contactaron destinatarios ni servicios de envío, ni se usaron datos o credenciales de Hostinger.

Ampliación NombreFantasia: se reutiliza `CLIENTE.Fantasia`, sin migraciones adicionales. Tipos correctos, 7 pruebas unitarias de mensajes y 17 casos del mayor/mensajes en MariaDB aprobados; se comprobaron el dato real, su uso en una plantilla guardada y el nombre alternativo para null, vacío o espacios.

Ajuste de presentación posterior al PR #34: reutilización de FormSections y campos persistentes al limpiar el cliente, sin cambios de API, tablas, variables, generación, copia o enlace de WhatsApp. No se ejecutaron compilaciones ni pruebas para este ajuste visual, según lo solicitado; las verificaciones anteriores corresponden a las entregas funcionales previas.

Corrección del prefijo argentino de WhatsApp: tipos correctos y 7 pruebas unitarias de mensajes aprobadas; 17 casos de integración del mayor/mensajes en MariaDB aprobados, verificando también que el teléfono original permanece intacto en la base tras consultar la normalización. La ayuda de Clientes se configura en el catálogo de campos compartido y reutiliza el hint del formulario base. No requiere migraciones.


## Entrega Varios clientes (04/11/2026)

Sin migraciones, tablas nuevas ni cambios de registración financiera. Conserva el permiso `envio-mensajes`, incluso para usuarios de solo consulta; se agrega únicamente acceso a la referencia acotada de tipos de cliente, sin conceder acceso al maestro. GET `/api/mensajes/clientes` consulta por filtros y POST `/api/mensajes/clientes/seleccionados` prepara una selección explícita, también en transacción de solo lectura; este último exige origen de aplicación y CSRF. Ambos validan filtros/páginas y ordenan mediante lista permitida, sin aceptar saldos, fechas ni usuarios suministrados desde el navegador.

Archivos de esta entrega:

- API: `messages/store.ts`, `messages/routes.ts`, nuevos `messages/validation.ts` y `messages/preview.ts`; `reports/ledger.ts` expone la fuente compartida; `references/routes.ts` autoriza la referencia de tipos.
- Web: `messages/MessagesPage.tsx`, nuevos `messages/ClientMessages.tsx` y `messages/message-preview.ts`, `messages/messages.css`, `services/messages.ts`.
- Contratos: `packages/shared/src/messages.ts`. Verificación: `tests/integration/account-ledger.test.ts`. Documentación: esta guía, README y roadmap.

Aceptación:

1. Ingresar con permiso Envío de mensajes, abrir Varios clientes y comprobar que solo se consulta al aplicar filtros. Probar tipo, búsqueda, activos/inactivos, positivos/negativos/cero/todos y resultados vacíos.
2. Elegir clientes con CheckBox de distintas páginas, Consultar seleccionados y Volver a filtros. Ordenar por saldo y comprobar que cambia el conjunto de la página según el orden global. Actualizar debe releer y limpiar selección.
3. Comparar cada saldo con el mensaje individual y el KPI Saldo total del Resumen con el mismo Hasta. Probar cobros/pagos parciales, varias afectaciones/valores, anulados, reversiones, anticipos, rechazo, sin movimientos y movimientos futuros.
4. Editar/guardar la plantilla y sus variables; ambos modos deben usar el mismo texto. Probar saldo a favor y cero sin anunciar una deuda por error, plantilla inválida y expansión extensa.
5. Revisar Propiedades, copiar y abrir un chat individual; texto y teléfono deben ser exactos. Probar teléfono ausente/incorrecto y portapapeles denegado. Confirmar envío manual y revisar móvil con scroll horizontal del listado.

Verificación de esta entrega: tipos correctos, 65 pruebas unitarias y suites completas con 201 pruebas en MySQL 8.4 y 201 en MariaDB 11.8.9 aprobadas. Incluyen comparación de los 113 clientes de la fixture con el mayor y la consulta individual, precisión, vigencia, fechas futuras, filtros, orden/paginación globales, relectura de elegidos, plantillas por usuario, CSRF/permisos y ausencia de escrituras financieras. Chromium en escritorio y móvil verificó selección entre páginas, consulta de elegidos, Propiedades, edición compartida sin consulta por tecla, copia/enlace exactos, negativos/cero, teléfono inválido, copia manual ante portapapeles denegado, refresco, orden remoto, resultados vacíos y scroll interno. Bases efímeras, API del navegador y destino WhatsApp simulados; sin contactar destinatarios ni utilizar datos de Hostinger.
