# Etapa 5: Cuenta corriente y SF

Primera entrega operativa de Cuenta corriente, sobre las 21 tablas existentes. La revisión actual requiere las migraciones hasta `0004_cuenta_corriente_concepto`; ver [actualización de numeración](numeracion-comprobantes.md) y [concepto por movimiento](#concepto-por-movimiento). No agrega tablas ni variables de entorno. La configuración funcional de COMPROBANTE no cambia.

## Alcance acordado

- Alta y consulta de movimientos manuales de deuda o crédito.
- Cálculo de saldos actuales separados de Cobrar y Pagar por cliente en la API; su resumen visual queda reservado para futuros informes.
- Anulación con motivo, usuario y fecha, conservando el movimiento y su número.
- Sin edición ni eliminación de movimientos guardados: para corregir, anular y cargar uno nuevo.
- Numerador opcional; su número es una sugerencia editable antes de guardar.
- Formato de comprobante `0000-00000000`. Sin Numerador se completan manualmente ambas partes. El punto admite 0 a 9999 y el correlativo 1 a 99999999.

No se registran fondos, cobros, pagos ni afectaciones desde esta pantalla. Las aplicaciones de créditos a deudas, el pendiente individual por documento y las cancelaciones se mantienen pendientes para sus etapas. Un crédito reduce el saldo neto de la cuenta; esta entrega no lo vincula automáticamente a una deuda concreta.

## Configuración de comprobantes para probar

El formulario ofrece únicamente comprobantes activos de CUENTACORRIENTE, con Cuenta COBRAR o PAGAR, Naturaleza DEUDA o CREDITO y SentidoFondos NOAPLICA. Las mismas condiciones se verifican en el backend al guardar. Configuraciones de otros módulos se conservan y no se ofrecen aquí.

| Ejemplo de descripción | Módulo | Cuenta | Naturaleza | Sentido de fondos | Efecto |
|---|---|---|---|---|---|
| Jugada | Cuenta corriente | Cobrar | Deuda | No aplica | Aumenta lo que debe el jugador |
| Crédito a favor | Cuenta corriente | Cobrar | Crédito | No aplica | Reduce lo que debe el jugador |
| Premio | Cuenta corriente | Pagar | Deuda | No aplica | Genera la obligación de pagar el premio |
| Ajuste de premio | Cuenta corriente | Pagar | Crédito | No aplica | Reduce esa obligación |

Los códigos son configurables: no se identifica el comportamiento por códigos como C, P o PR. El premio registra una obligación, no la entrega efectiva del dinero. Su pago se implementará desde Cobros y pagos.

Cuenta y Naturaleza se copian al movimiento desde el comprobante al guardar. Cambiar el maestro posteriormente no reinterpreta los movimientos anteriores. Las descripciones de cliente y comprobante se consultan mediante relaciones y no se duplican en la base.

## Numeración

CUENTACORRIENTE almacena únicamente NumeroComprobante como BIGINT sin signo, sin FK Numeracion ni columna Serie. El valor es `punto × 100000000 + correlativo`: `0001-00000025` equivale a `100000025`. Los NULL históricos se conservan y se presentan como «Sin número»; las altas nuevas requieren número válido.

- Al seleccionar un comprobante, se consulta internamente su Numerador activo y se propone su próximo número completo. No hay selector de Numerador.
- Sin configuración activa, se muestran dos partes en cero para completar manualmente. Ambas partes son editables también cuando existe una sugerencia.
- El control NumeroComprobante tiene dos inputs unidos, completa ceros al salir y admite pegar el formato completo. Abrirlo o consultar opciones no reserva ni consume números.
- Al confirmar, se impiden duplicados por comprobante y número completo, incluidos anulados, comprobando CUENTACORRIENTE y CAJAMOVIMIENTO.
- Se bloquea la fila del Numerador y se utiliza GET_LOCK por base, comprobante canónico y punto antes de la transacción. La clave única en cada tabla refuerza la integridad. Las futuras escrituras de Cobros y pagos deben usar este mismo protocolo.
- Si se conserva el punto sugerido, el próximo número avanza al menos hasta el mayor utilizado más uno, sin retroceder. Si se cambia el punto, la carga es manual y no altera la configuración original.
- Si dos usuarios guardan el mismo número, solo uno confirma; el otro recibe un conflicto y debe elegir otro número. No se reemplaza silenciosamente el ingresado.
- Al confirmar el correlativo 99999999 en el punto del Numerador, se conserva su valor y se desactiva. No se incrementa automáticamente el punto de venta.

Los números históricos son independientes del Numerador y no cambian al modificarlo o eliminarlo. Ver [migración y reglas](numeracion-comprobantes.md).

## Formulario y listado

Orden del formulario: Comprobante primero, Número de comprobante, Cliente mediante SF, fechas compactas de origen y vencimiento una debajo de otra y Observaciones. Una ficha Importes compacta, alineada a la izquierda y siempre visible agrupa el Importe y permite incorporar otros importes más adelante. Cuenta y Naturaleza no se muestran como controles: el backend las determina y conserva desde el comprobante. Los importes son positivos con hasta dos decimales; Crédito determina la disminución, sin importes negativos. Vencimiento no puede ser anterior a Fecha de origen. Las fechas utilizan DatePicker: escritura manual con dd/MM/yyyy y calendario nativo. Importe utiliza AmountBox con presentación argentina y valor decimal canónico. Ver [componentes](controles-fechas-importes.md).

El listado comienza sin consultar, con Fecha desde/hasta sugeridas al día actual y Estado Confirmado. Aplicar filtros o Actualizar solicita los datos; no hay refrescos periódicos. Los filtros incluyen búsqueda general (también por código o nombre del cliente), cuenta, estado y rango de fechas, sin selector específico de Cliente. El parámetro Cliente de la API se conserva para consultas internas y futuros módulos; el SF del formulario de alta mantiene su funcionamiento. Se muestran descripciones de las referencias, número formateado y estado, sin IDTabla. Se consulta una fila por selección y el botón del ojo o por doble clic.

El listado no muestra tarjetas de saldos. El cálculo permanece en la API para futuros informes: se realiza sobre todos sus movimientos CONFIRMADO, sin aplicar los otros filtros del listado: DEUDA suma y CREDITO resta, por separado en COBRAR y PAGAR. No se descuentan nuevamente las afectaciones. Sin cliente seleccionado no se presenta un saldo global que mezcle distintas cuentas comerciales.

Guardar o anular actualiza los datos solamente si antes se había solicitado el listado. Volver a entrar al módulo comienza sin consultar.

## SF reutilizable

`SearchField<T>` recibe la función de búsqueda, las columnas de resultados, cómo obtener código y descripción, el registro seleccionado y su callback. No conoce tablas ni endpoints.

- Lupa o Enter realiza la búsqueda; escribir o entrar al formulario no consulta automáticamente ni establece una selección válida.
- Cero coincidencias informa el resultado; una selecciona automáticamente; varias abren una ventana de selección.
- La ventana reutiliza Modal, DataTable y Pagination, sin acciones de ABM. Permite buscar, paginar, seleccionar y confirmar o elegir por doble clic; Escape/Cancelar cierra.
- El input muestra `código - descripción` del registro seleccionado, sin otra etiqueta debajo. Editar ese texto invalida la selección anterior. Limpiar borra texto, selección e identificador y cancela la búsqueda pendiente para que una respuesta tardía no restaure el valor.
- Sin coincidencias se muestra un aviso y el input toma un fondo rojo claro y aria-invalid. Una búsqueda con coincidencias o Limpiar retiran ese estado. La lupa y la goma se alinean con el centro del input.

`ClientSearch` es el adaptador de Cuenta corriente: reutiliza la búsqueda del maestro de Clientes, incluidos código y nombre. Ofrece activos para altas e incluye históricos para filtros. El resto del diseño y comportamiento pertenece al SF genérico. Otros módulos podrán aportar otra fuente y columnas sin crear un nuevo control visual.

## Confirmación, anulación e integridad

Las altas y anulaciones requieren ADMIN y CSRF; los demás usuarios activos pueden consultar. La interfaz no ofrece modificar o eliminar movimientos financieros. La API tampoco expone esas operaciones.

La confirmación inserta movimiento, actualiza Numerador cuando corresponde y registra AUDITORIA en una sola transacción. SOLICITUD controla reintentos mediante usuario, acción, clave y huella del contenido: reenviar la misma operación devuelve el resultado guardado sin duplicarla; reutilizar la clave con otro contenido se rechaza. El frontend conserva la clave mientras reintenta el mismo contenido.

Anular exige motivo y la versión actual. Solo se admiten movimientos manuales confirmados sin CajaMovimiento ni afectaciones relacionadas. No se eliminan registros ni se retrocede el Numerador. Las reglas posteriores de corrección de cobros/pagos se desarrollarán con esos módulos.

Los importes viajan como texto decimal y se suman en SQL DECIMAL. IDTabla y BIGINT se transportan como texto; no se convierten importes a Number. Las consultas de listado, cantidad y saldos se realizan en la misma transacción de lectura.

## API

- GET `/api/cuenta-corriente/opciones`: comprobantes compatibles y próximos números activos por comprobante; no emite números.
- GET `/api/cuenta-corriente`: filtros q, Cliente, Comprobante, Cuenta, Estado, Desde, Hasta, pagina y limite.
- GET `/api/cuenta-corriente/:id`: consulta y versión ETag.
- POST `/api/cuenta-corriente`: alta; requiere Idempotency-Key.
- POST `/api/cuenta-corriente/:id/anular`: motivo, If-Match e Idempotency-Key.

## Cómo probar

1. Aplicar y comprobar la migración de numeración según la [guía de Hostinger](numeracion-comprobantes.md#actualizar-una-base-existente-en-hostinger). No es suficiente que existan las 21 tablas si su estructura aún es la anterior.
2. Configurar Jugada, Crédito a favor y Premio como en la tabla. En Numerador configurar Jugada con Próximo número `0001-00000025`.
3. Entrar a Cuenta corriente: la grilla empieza vacía y no consulta hasta Actualizar o aplicar filtros. Agregar: el foco comienza en Comprobante. Seleccionarlo y buscar el cliente por SF.
4. Elegir Jugada: debe sugerir `0001-00000025` sin mostrar Numerador. Guardar importe 100,25, vencimiento igual a la fecha de origen y Observaciones vacío. Se conserva NULL en Observaciones y se guarda `100000025` como número.
5. Actualizar y filtrar por cliente: se muestran sus movimientos sin tarjetas de saldo. La API conserva Cobrar 100,25 y Pagar 0,00. Otro alta de Jugada propone `0001-00000026`.
6. Cambiar el correlativo sugerido a 50 y guardar: la próxima sugerencia será 51. Un número libre menor puede guardarse sin retroceder el Numerador. Un duplicado debe rechazarse.
7. Cambiar manualmente el punto a 0002: el número se guarda con ese punto, sin modificar el próximo configurado para 0001. Con un comprobante sin Numerador, ambas partes empiezan en cero y se pueden completar libremente.
8. Cargar Crédito a favor por 30,05 y Premio por 200: el cálculo de la API conserva Cobrar 70,20 y Pagar 200,00, sin mostrarlo en la grilla. Consultar por doble clic y anular con motivo: se conserva la numeración y el número anulado no puede reutilizarse.
9. Probar edición por teclado de las dos partes, pegado completo, usuario de consulta y móvil. Cambiar el Numerador no debe alterar los números ya guardados.

## Verificación

`NODE_ENV=production npm run check`, integración aislada en MySQL 8.4 y MariaDB 11.8.9 y Chromium con API/base reales. Se verifican sugerencias, edición, conflictos concurrentes, idempotencia, rollback, importes, permisos, saldos, búsqueda por número numérico y formateado, agotamiento sin cambio de punto y migración de registros históricos. Las bases de pruebas son efímeras y no utilizan la conexión de Hostinger.

Esto no identifica por sí solo la causa del fallo informado en la vista previa. Tras aplicar la migración allí, repetir el caso original; si continúa, obtener la referencia y el registro técnico según la sección de diagnóstico.

## Pendiente

Cobros y pagos con medios de pago y afectaciones, Tesorería, Valores y aplicaciones entre créditos y deudas. DatePicker, AmountBox y SF ya están disponibles. Las anulaciones de operaciones financieras relacionadas se definirán junto con esos circuitos.

## Diagnóstico de fallos de guardado

Ante un 5xx de Cuenta corriente, la respuesta incluye una referencia que se correlaciona con un registro técnico acotado en el servidor. Ver [caso reproducido y obtención de la excepción en Hostinger](diagnostico-guardado-cuenta-corriente.md). No atribuir la causa a Observacion NULL: el esquema la admite y ese caso se confirma en integración.

## Ajustes de presentación y SF

La revisión posterior de experiencia de usuario no agrega migraciones ni cambia reglas financieras. Ver [archivos, tamaños y prueba detallada](cuenta-corriente-presentacion-sf.md).

Las altas sugieren hoy en origen/vencimiento e Importe 0,00. Las consultas conservan valores históricos. Ver [inicialización y limpieza](valores-iniciales-abm.md).

## Anular desde la consulta

El formulario de un movimiento confirmado ofrece Anular en su toolbar a quienes tienen permiso de escritura. No aparece en altas ni en movimientos anulados o para usuarios de consulta; se mantiene deshabilitado para movimientos vinculados a Caja, como en la grilla.

Ambas entradas renderizan el mismo CancelMovement y llaman al mismo servicio existente: motivo, versión, idempotencia y restricciones del backend se conservan. Cancelar el diálogo regresa a la consulta sin cerrarla; confirmar cierra formulario/diálogo y actualiza el listado mediante el flujo existente. Con Estado Confirmado, el movimiento anulado deja de verse hasta cambiar el filtro.

FormToolbarActions es una base visual reutilizable con acción annulAction opcional y contenido para las demás acciones. No conoce estados, permisos, tablas ni endpoints: cada módulo decide si la ofrece y conecta su propia operación. No se agregan acciones de anulación a maestros que no tienen ese circuito.

Prueba manual: abrir un confirmado por doble clic, presionar Anular, cancelar y comprobar que la consulta sigue abierta; repetir con motivo y confirmar. Consultar luego el anulado con filtro Anulados/Todos: ya no debe mostrar Anular. Comprobar también que el alta y el perfil de consulta no lo ofrecen y que la grilla mantiene la misma anulación. Esta revisión no ejecutó compilaciones ni pruebas automáticas.


Cuenta corriente utiliza el FormSections compartido con Caja movimiento: Datos generales contiene la cabecera, cliente, fechas, observaciones y estado; Importes conserva su control de importe y formato. La columna lateral, el comportamiento sticky y los enlaces de desplazamiento son comunes. Las fechas de grillas y consultas se presentan como dd/MM/yyyy sin modificar el valor ISO enviado a la API.


La cabecera dispone comprobante, cliente, fechas, concepto y observaciones a la izquierda y conserva Número de comprobante a la derecha. FormSections resalta la sección visible por scroll con fondo verde semitransparente y una marca lateral discreta; conserva su encabezado sticky. El concepto se selecciona desde el DropDown base; no es una grilla de renglones ni incorpora importes adicionales.


## Concepto por movimiento

Se reutiliza CONCEPTO y se permite un concepto opcional por movimiento manual. El DropDown, ubicado después de las fechas y antes de Observaciones, ofrece únicamente conceptos activos y la opción Sin concepto. El backend vuelve a validar que el concepto exista y esté activo dentro de la transacción, con bloqueo de lectura; una opción desactivada después de abrir el formulario se rechaza sin registrar un movimiento parcial.

La migración `0004_cuenta_corriente_concepto` agrega únicamente CUENTACORRIENTE.Concepto VARCHAR(20) nullable y su FK a CONCEPTO.Codigo, en un solo ALTER. No crea tablas, elimina filas ni completa datos históricos: los movimientos anteriores conservan todos sus campos y quedan con Concepto NULL. La FK impide borrar un concepto utilizado; desactivarlo conserva las consultas históricas.

Al consultar el formulario y Propiedades se muestra la descripción actual mediante LEFT JOIN, incluso si el concepto fue desactivado. Solo se almacena el código; no se copia la descripción en CUENTACORRIENTE. No cambia el saldo, la naturaleza, las afectaciones, el asiento interno de Caja ni las reglas de anulación. Cambiar la descripción del maestro no altera la versión del movimiento. Las solicitudes anteriores que omitan Concepto siguen siendo válidas y se guardan sin concepto.

Antes de utilizar este código en Hostinger, con las variables de la aplicación disponibles en SSH y desde la versión desplegada, detener temporalmente el acceso de usuarios y ejecutar `npm run db:migrate:prod`. Luego verificar `npm run db:check:prod` y volver a habilitar la aplicación. La migración está incluida en el repositorio; no se ejecutó contra Hostinger desde el entorno de desarrollo.

Prueba: crear o activar un concepto en su maestro, abrir un alta de Cuenta corriente y seleccionarlo. Guardar y comprobar su descripción en Consulta y Propiedades. Repetir sin concepto, consultar movimientos anteriores y comprobar que siguen disponibles. Desactivar el concepto utilizado: debe seguir visible en el movimiento histórico y dejar de ofrecerse para nuevas altas. Las pruebas de integración verifican FK, auditoría, compatibilidad de solicitudes sin el campo, conservación histórica y saldos inalterados.
