# Envío de mensajes — consulta individual y varios clientes

CLI-01, revisión 04/11/2026. Los informes pendientes siguen en pausa. El módulo prepara texto, permite copiarlo y abre un chat con el mensaje escrito; **el usuario confirma el envío dentro de WhatsApp**. No integra API oficial, envíos automáticos, masivos/programados, proveedores pagos ni verificación de entrega/lectura. Permite registrar confirmaciones manuales de avisos.

## Funcionamiento

**Notificaciones → Envío de mensajes** reutiliza el SF de clientes, TextArea, DropDown, AmountBox, TextBox, botones y estilos existentes. La categoría participa del mismo acordeón y solo aparece si hay alguna opción autorizada.

Al ingresar se carga la plantilla del usuario autenticado. Elegir un cliente válido consulta el saldo real y muestra saldo firmado, fecha de corte, teléfono y vista previa. Escribir un código/nombre sin resolver el SF no consulta el saldo. Se admiten clientes inactivos con movimientos históricos, igual que en el Resumen.

El formulario reutiliza **FormSections** con tres fichas: **Configurar mensaje** (plantilla, variables y guardado), **Envío de mensajes** (cliente, datos, vista previa y acciones) y **Varios clientes** (consulta por filtros y acciones por cliente). Conserva la columna lateral, Sticky, selección automática por sección visible y navegación mediante scroll; en móvil utiliza la adaptación del componente base. Las secciones permanecen montadas, sin perder borradores al navegar.

Los campos Saldo total, Saldo hasta, Teléfono y Vista previa permanecen visibles sin cliente, con valores vacíos y las acciones de copia/WhatsApp deshabilitadas. Los espacios informativos tienen altura reservada para evitar saltos al seleccionar, actualizar o limpiar. No se conserva ni se muestra el resultado del cliente anterior para completar esa estructura.

Cambiar/limpiar el cliente descarta el resultado anterior y cancela peticiones pendientes; una respuesta tardía no puede reponer el mensaje de otro cliente. **Actualizar mensaje** vuelve a consultar saldos y teléfono. Un error de actualización retira el resultado anterior. Editar la plantilla reemplaza variables sobre los datos ya consultados, sin repetir consultas financieras por cada tecla.

## Varios clientes: consulta simple y envío manual individual

Se amplía el módulo existente con una tercera ficha, compartiendo menú, configuración y permisos. Reutiliza FormSections, DataTable con selección simple para Propiedades, ActionToolbar, FilterDialog, DropDown, Pagination y la presentación de tablas de Informes.

**Filtrar clientes** abre el modal; no se consulta ningún cliente al entrar ni antes de aplicar los filtros. Se admiten tipo de cliente (incluidos tipos inactivos), búsqueda por código/nombre/fantasía y estado de los clientes, por defecto activos. No se muestra un selector de saldo: la consulta utiliza saldo neto distinto de cero, incluyendo a favor, siempre con su signo y texto correspondiente. Es el neto del Resumen, no pendiente documental: deudas y premios pueden compensarse sin cancelar sus documentos. La consulta individual sigue permitiendo clientes sin saldo.

Cada fila muestra cliente, teléfono original, saldo firmado, vista previa y las acciones individuales **Copiar mensaje** y **Abrir WhatsApp**. No hay CheckBox, selección de página, consulta de elegidos ni limpieza de selección. La fila se puede seleccionar únicamente para consultar Propiedades. La tabla tiene scroll interno, ordenamiento remoto y páginas de 20; filtros y orden se aplican antes de paginar. El texto completo se consulta desde Propiedades o su tooltip.

Se utiliza la misma plantilla personal que en el envío individual, incluido el borrador sin guardar. Editarla actualiza las vistas previas sin consultar saldos por cada tecla. Los errores se indican por cliente; un teléfono inválido impide WhatsApp pero permite copiar. Si falla el portapapeles, se muestra el texto para copia manual. Actualizar relee saldos y teléfonos; un fallo retira los resultados anteriores y una respuesta tardía se descarta.

Cada mensaje se copia o abre mediante una acción explícita en su fila. El usuario revisa y presiona Enviar dentro de WhatsApp. No se abren múltiples chats automáticamente ni se registra «enviado» al copiar o abrir un enlace. El registro manual se realiza con una acción independiente y confirmación explícita.

## Registrar envío y Último aviso

La tabla agrega **Último aviso** (fecha del negocio e importe informado) y una columna con encabezado **Registrar envío**. Su botón de tilde es una acción, nunca un CheckBox ni una marca permanente. Sin antecedentes muestra «Sin avisos registrados».

Después de enviar manualmente en WhatsApp o copiar/pegar, el operador presiona la tilde. El modal muestra cliente, teléfono registrado, saldo y fecha de corte, texto preparado y último aviso, si existe. **Cancelar** no guarda nada. **Confirmar envío** registra una declaración manual del usuario. El sistema no conoce el envío, entrega o lectura reales de WhatsApp. El operador debe revisar que el texto coincida con el que envió, porque WhatsApp permite editarlo.

Cada confirmación nueva conserva el aviso anterior: no hay reinicios diarios, bloqueos permanentes ni frecuencia impuesta. Si el aviso es repetido, el modal informa el último registro y permite confirmar uno nuevo. La misma funcionalidad está disponible en la consulta individual. Ambos modos se actualizan al registrar y conservan los datos tras refrescar, cambiar filtros o volver a entrar.

Al presionar la fecha de **Último aviso**, un OffCanvas reutiliza DataTable, toolbar estándar, paginación y Propiedades para consultar el historial, más reciente primero: fecha/hora, saldo informado, fecha del saldo, usuario, teléfono, texto y «WhatsApp · Manual». Es compartido por los usuarios con acceso a Mensajes; las plantillas siguen siendo personales.

Se guarda exactamente la versión preparada: nombre y teléfono originales de esa consulta, fecha de corte, saldo y texto resultante de la plantilla que el usuario confirmó, aunque sea un borrador sin guardar. Si cambian los datos o se registra un cobro mientras está en WhatsApp, no se reemplaza lo informado por el nuevo saldo. La API firma los datos de preparación ligados a la sesión y reconstruye el texto con sus variables; no acepta un importe/cliente/usuario arbitrario. Cambiar de sesión requiere volver a consultar. El recibo de preparación no crea borradores ni filas en la base.

Cada modal usa una clave de confirmación propia, con unicidad en la base por usuario. El doble clic o reintento con esa misma clave devuelve el registro existente. Una confirmación nueva usa otra clave y registra otro aviso. Esta protección evita duplicados de registro por reintentos, no verifica ni impide envíos reales repetidos desde WhatsApp.

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
- Acceso a Mensajes habilita preparar/copiar/abrir chat, guardar **su propia preferencia**, registrar avisos manuales y consultar su historial compartido, sin conceder escrituras financieras ni acceso a otros ABM/Informes. El SF auxiliar sigue proyectando Código, Nombre y Activo si no hay permiso del maestro.
- `GET /api/mensajes/plantilla`: devuelve la plantilla propia o null para el predeterminado, y versión.
- `PUT /api/mensajes/plantilla`: recibe únicamente `{ Plantilla: string | null }`. Requiere sesión, permiso, petición de aplicación, CSRF e If-Match. El usuario se obtiene de la sesión; no se admite un Usuario en el cuerpo. Versión desactualizada devuelve 409.
- `GET /api/mensajes/vista-previa?Cliente=...`: datos reales, variables, mensaje con plantilla guardada y teléfono/validación. No permite aportar saldo o fecha de corte. Respuestas sin caché. No existe endpoint de envío.
- `POST /api/mensajes/avisos`: exige permiso Mensajes, origen de aplicación, CSRF, clave UUID de idempotencia, preparación firmada, plantilla válida y confirmación true. Graba usuario y fecha en servidor. No recalcula el saldo ya informado ni afecta operaciones financieras.
- `GET /api/mensajes/avisos?Cliente=...`: historial compartido, paginado y de solo lectura; cliente obligatorio.
- Persistencia: **USUARIO.MensajeSaldoPlantilla** (0010) y nueva tabla **MENSAJEAVISO** (0011), con FK a Cliente/Usuario, copia de los datos informados, índice de consulta por cliente/fecha y clave única de confirmación. Saldo DECIMAL exacto, sin Number. No se borran ni sobrescriben avisos al registrar otro. Los errores técnicos no escriben mensajes, teléfonos ni saldos en logs.

## Publicación

Aplicar las migraciones pendientes, incluida **0011_mensaje_aviso_manual**, antes de probar el registro de avisos, con el procedimiento habitual y la aplicación detenida:

```sh
npm run db:migrate:prod
npm run db:check:prod
```

0010 agregó la plantilla opcional. 0011 crea MENSAJEAVISO con sus FKs e índices, conservando clientes, usuarios y movimientos existentes. `db:check:prod` debe informar **22/22 tablas**, además del historial técnico de migraciones. No se requieren credenciales ni configuración de WhatsApp/SMS. El catálogo y el renderizado compartidos permiten añadir variables; futuros transportes, lotes y programación seguirán requiriendo su propia definición y no se implementan anticipadamente.

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

La consulta de varios clientes no altera la registración financiera. El registro manual de avisos requiere la migración 0011. Conserva el permiso `envio-mensajes` y agrega acceso a la referencia acotada de tipos, sin conceder el maestro. GET `/api/mensajes/clientes` consulta en un snapshot de solo lectura, con filtros/paginación y orden validado. No acepta saldos, fechas ni usuarios aportados desde el navegador. Se retiró la ruta de consulta de seleccionados que ya no utiliza la ficha simplificada.

Archivos: API `messages/store.ts`, `messages/routes.ts`, `messages/validation.ts`, `messages/preview.ts`, `reports/ledger.ts` y `references/routes.ts`; web `messages/MessagesPage.tsx`, `messages/ClientMessages.tsx`, `messages/message-preview.ts`, `messages/messages.css` y `services/messages.ts`; contratos `packages/shared/src/messages.ts`; pruebas `tests/integration/account-ledger.test.ts`; esta guía, README y roadmap.

Aceptación:

1. Aplicar tipo, búsqueda y estado en Varios clientes. Solo se consulta al aceptar los filtros. No deben aparecer CheckBox, acciones de selección ni filtro de saldo neto.
2. Comparar saldos con el modo individual y el KPI Saldo total del Resumen con el mismo Hasta. Incluir deudas, premios, afectaciones, anulaciones y reversiones. El lote omite netos cero; un saldo negativo debe conservar su signo y mensaje a favor.
3. Revisar paginación, orden global y Actualizar. Seleccionar una fila debe habilitar Propiedades sin generar mensajes ni abrir chats adicionales.
4. Editar la plantilla y revisar vistas previas, Copiar y WhatsApp por cliente; probar teléfono inválido, portapapeles denegado, resultados vacíos y móvil.

Las verificaciones de la entrega original incluyeron tipos, 65 pruebas unitarias y 201 pruebas de integración por motor. La revisión simplificada pasó tipos, los 20 casos de mayor/mensajes en MySQL 8.4 y MariaDB 11.8.9, y Chromium de escritorio/móvil: filtros sin selector de saldo, ausencia de CheckBox/acciones de selección, Propiedades, copia/WhatsApp, plantilla compartida, negativos, teléfono inválido, copia manual, actualización, orden, paginación, vacío y scroll interno. Las suites completas anteriores corresponden a la revisión original. Se utilizan bases efímeras y WhatsApp simulado, sin contactar destinatarios ni usar datos de Hostinger.


## Aceptación del registro manual

1. Aplicar migración 0011 y verificar 22/22. Abrir Varios clientes: los encabezados **Último aviso** y **Registrar envío** deben ser visibles; todavía sin avisos para clientes sin antecedentes.
2. Copiar o abrir WhatsApp y volver: no debe registrarse un aviso. Presionar tilde y Cancelar: tampoco.
3. Confirmar: fecha e importe aparecen inmediatamente. Refrescar, cambiar filtros o recargar: persisten. Revisar sincronización con la consulta individual.
4. Abrir la fecha para consultar Historial/Propiedades. Registrar otro aviso posteriormente: último aviso se actualiza y el anterior se conserva, con su texto y saldo.
5. Consultar un saldo, registrar después un cobro/cambiar teléfono en otra sesión y confirmar el aviso preparado: debe conservar lo informado originalmente. No modifica el saldo actual de Cuenta corriente.
6. Simular fallo de red al confirmar y reintentar: una misma confirmación no se duplica. Una confirmación nueva puede registrar otro aviso sin imponer frecuencia.
7. Revisar móvil, saldos a favor y permisos. El historial está compartido entre usuarios autorizados; sin acceso a Mensajes, su API está bloqueada.


Verificación del registro manual: tipos correctos, **66 pruebas unitarias**, suites completas con **202 pruebas en MySQL 8.4 y 202 en MariaDB 11.8.9**, todas aprobadas. Incluyen migración y repetición sin pérdida de datos, FK/collation compatibles, firma ligada a sesión, rechazo de datos adulterados/CSRF/permisos, snapshot anterior a cambios de saldo/teléfono, reintentos concurrentes con una sola fila, nuevos avisos, historial compartido/paginado, signos/cero y ausencia de escrituras financieras. Se actualizaron los conteos de esquema en pruebas anteriores para incluir MENSAJEAVISO.

Chromium escritorio/móvil, con API y WhatsApp simulados: encabezados Registrar envío/Último aviso, cancelar/confirmar, error y reintento con la misma clave, historial, aviso nuevo, sincronización individual/listado y persistencia al recargar. Copiar y abrir WhatsApp no generaron registros. Sin contactos reales ni datos de Hostinger.
