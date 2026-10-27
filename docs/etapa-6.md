# Etapa 6: Caja movimiento — Cobros y pagos

El módulo usa las tablas existentes y comparte controles, tabla, filtros, toolbar, SF y OffCanvas. Se agrega la migración `0003_caja_movimiento`; no hay nuevas tablas, dependencias ni variables de entorno.

## Alcance

- Alta y consulta de cobros/pagos; los confirmados no se editan ni eliminan.
- Apertura, cierre y selección de caja desde el botón de caja del toolbar de **Cobros y pagos** (OffCanvas lg). Toda operación exige una caja activa abierta, aunque solo el efectivo altera su saldo físico.
- Comprobante primero, Número de comprobante de dos inputs y BIGINT único, Cliente por SF, caja seleccionada de solo lectura, fecha, concepto y observaciones.
- Secciones Datos generales, Afectaciones, Valores e Importes visibles simultáneamente mediante scroll. FormSections ofrece navegación lateral; en pantallas angostas pasa a enlaces superiores que se distribuyen en filas. Importes muestra los medios a la izquierda y su aplicación a la derecha; en móvil se apilan.
- Listado bajo demanda, filtros en modal, consulta por doble clic y Propiedades de solo lectura. No hay recarga periódica de registros.
- ADMIN escribe; usuarios de consulta acceden a listados, detalles y Propiedades.

## Preparación en Hostinger

El PR debe desplegarse con la compilación habitual. Antes de utilizar Cobros y pagos, desde la raíz del despliegue y con las variables DB disponibles en SSH:

```sh
npm run db:migrate:prod
npm run db:check:prod
```

Las variables de hPanel del proceso web no se exportan automáticamente a una sesión SSH nueva. Seguir la configuración de [Hostinger](hostinger.md); no pegar contraseñas en comandos compartidos ni en el chat.

Comprobá qué DB_NAME utiliza la vista previa antes de ejecutar comandos: el repositorio no crea una base separada automáticamente por Pull Request.

La migración agrega:

| Tabla | Cambio |
| --- | --- |
| CAJAMOVIMIENTO | ImporteACuenta inicial, CajaMovimientoOrigen con FK propia y unicidad para una reversión completa por operación. |
| CHEQUE | CuentaLibradora e índices de identidad por tipo/cuenta/número y tipo/banco/cuenta libradora/número. |
| CAJAMOVIMIENTOAFECTACION | CreadoEn y Usuario, para distinguir el registro inicial de aplicaciones posteriores. |

No elimina registros ni columnas. Los movimientos anteriores conservan sus totales y relaciones; ImporteACuenta se obtiene como total menos las afectaciones existentes. Las afectaciones anteriores reciben la fecha y usuario de su movimiento de origen. Los cheques históricos conservan CuentaLibradora NULL hasta que pueda documentarse ese dato: no se inventa una cuenta emisora.

La comprobación previa es de solo lectura y detiene la migración antes del DDL si hay totales incompatibles o cheques duplicados para los nuevos índices. Hay que revisar esos registros con criterio funcional; no se borran ni fusionan automáticamente. Si se conservan datos relevantes, hacer una copia antes de aplicar DDL y detener escrituras durante la actualización. Ante una migración interrumpida, revisar el estado del DDL antes de repetirla.

## Comprobantes

Los códigos y descripciones son libres. Ejemplos de configuración:

| Uso | Módulo | Cuenta | Naturaleza | Sentido |
| --- | --- | --- | --- | --- |
| Cobro | Cobros y pagos | Cobrar | Crédito | Ingreso |
| Pago | Cobros y pagos | Pagar | Crédito | Egreso |
| Reversión de cobro | Cobros y pagos | Cobrar | Deuda | Egreso |
| Reversión de pago | Cobros y pagos | Pagar | Deuda | Ingreso |

Un Numerador activo es una sugerencia opcional. Se conserva el protocolo compartido de bloqueo por comprobante/punto, comprobación entre CUENTACORRIENTE y CAJAMOVIMIENTO, incremento al confirmar, agotamiento y ausencia de FK al Numerador. El comprobante de reversión también puede tener Numerador.

## Cajas

El maestro Cajas administra solamente sus registros (código, nombre y estado). No muestra acciones de apertura/selección ni el mensaje de caja activa.

Solo puede existir una apertura activa por Caja. La apertura bloquea el maestro para serializar solicitudes simultáneas. El saldo inicial es manual y no negativo.

El efectivo disponible es el saldo inicial más ingresos menos egresos confirmados asignados a esa apertura. Transferencias y cheques no aumentan el efectivo. No se permiten egresos por encima del efectivo disponible ni saldos que excedan el rango monetario de la tabla.

El cierre registra fecha, usuario, saldo teórico, contado y observación. Una diferencia exige observación y se conserva como contado menos teórico; no genera ajustes automáticos. El usuario define el saldo inicial de la siguiente apertura. En el panel compartido **Administrar cajas**, accesible exclusivamente desde el toolbar de Cobros y pagos, luego de abrir debe utilizar explícitamente Usar caja. Hacer clic o doble clic en una fila solo la resalta; la selección visual es independiente de la caja activa. La primera elección con Usar caja es directa. Si ya hay una apertura activa distinta, se muestra Confirmar/Cancelar antes de cambiarla; cancelar conserva la anterior. Abrir no elige ni cambia automáticamente la caja. La selección se conserva por usuario/sesión en sessionStorage de la pestaña, al navegar y recargar; no se comparte entre usuarios ni obliga a todas las pestañas a operar en la misma caja.

Cobros y pagos y su reversión toman esa selección: no ofrecen otro selector ni Administrar cajas/Actualizar opciones dentro del formulario. El listado permite abrir el panel sin abandonar el módulo: el botón muestra Administrar caja sin selección o el nombre de la apertura seleccionada. El panel también omite el mensaje de selección y el botón textual Actualizar cajas; usa DataTable y ActionToolbar con Actualizar y Propiedades, sin altas/modificaciones/bajas. Propiedades reutiliza MasterProperties para consultar el maestro de la fila resaltada, sin cambiar la apertura activa. La apertura o el cierre se mantiene en un bloque separado debajo de la tabla; sus botones conservan la operación existente. No hay un mensaje independiente de caja seleccionada en ese listado; el alta está deshabilitada sin selección. La cabecera muestra la caja como texto discreto debajo del número, en la columna derecha; Cliente tiene ancho acotado y Fecha de origen aparece debajo. Las consultas históricas siguen habilitadas y muestran su caja original. GET /api/caja-movimiento/cajas/:id/estado comprueba solo la apertura elegida al navegar o recuperar el foco, sin consultar listados, bancos ni saldos. No hay sondeo periódico. Al abrir el formulario se validan también las referencias, y el guardado conserva el bloqueo y la comprobación transaccional original.

Si se cierra o desactiva la caja, se invalida la selección sin elegir otra automáticamente ni borrar el resto del borrador abierto. Un fallo de red no equivale a cierre: el servidor sigue siendo la autoridad. Cerrar desde el panel invalida la preferencia inmediatamente. Cada pestaña detecta cierres externos al volver o al operar. Una caja cerrada no admite nuevas operaciones. Sus registros y cifras de cierre no se recalculan por reversiones posteriores.

## Afectaciones

Afectar abre OffCanvas lg y consulta pendientes únicamente con cliente y comprobante válidos. Cobros ofrece deudas de Cobrar y Pagos ofrece deudas de Pagar. No limita los documentos al comprobante de la cabecera ni al día actual; los pendientes históricos siguen disponibles.

La tabla base tiene selectionMode opcional: single continúa por defecto; multiple incorpora el CheckBox base visible por fila, selectedKeys y onMultipleSelectionChange. Los ABM existentes conservan su modo simple.

Seleccionar sugiere todo el pendiente y permite un importe parcial positivo. El panel conserva selecciones al paginar/filtrar. Confirmar actualiza el borrador; Cancelar/Escape no modifica sus afectaciones anteriores. La ficha muestra los importes como solo lectura y permite quitar filas mediante la papelera del ActionToolbar. Para cambiar un importe se quita la afectación y se vuelve a incorporar desde el panel.

Al confirmar se agregan únicamente las nuevas selecciones, conservando las anteriores. Al reabrir, los ID de las afectaciones ya incorporadas se envían en Excluir (hasta 100 IDs validados); el servidor aplica NOT IN parametrizado antes del conteo y paginación. Se excluye todo el documento dentro del borrador actual, aunque la aplicación sea parcial. Quitar la fila lo vuelve a ofrecer con su pendiente real. Esta consulta no reserva ni reduce saldos; una operación futura puede afectar el remanente después del guardado.

Cambiar de cliente pide descartar las afectaciones y el importe a cuenta; cancelar conserva la selección. Comprobantes de la misma cuenta/sentido conservan afectaciones; cambiar a otra operación pide confirmación y descarta datos incompatibles. Las consultas pendientes se cancelan al cerrar el selector.

El pendiente individual es importe original menos afectaciones vigentes. Se vuelve a comprobar bajo bloqueo al confirmar. Dos cobros no pueden consumir el mismo pendiente; un conflicto conserva el borrador y no reduce silenciosamente sus importes.

## Valores

Agregar valor permite registrar transferencia, cheque recibido o cheque propio según el sentido de la operación, sin ingresar a otro módulo. Los valores nuevos se editan o quitan mientras son borrador mediante los iconos Agregar/Modificar/Eliminar del ActionToolbar base, con tooltips. Las acciones específicas de cartera y consulta usan sus acciones opcionales. Consultar cheque abre sus propiedades sin modificar el instrumento.

| Instrumento | Registro |
| --- | --- |
| Transferencia recibida/realizada | TRANSFERENCIA vinculada al movimiento y BANCOMOVIMIENTO una sola vez. |
| Cheque recibido en cobro | CHEQUE de tipo TERCERO, estado CARTERA y CHEQUEEVENTO RECEPCION. |
| Cheque propio en pago | CHEQUE de tipo PROPIO, estado EMITIDO y CHEQUEEVENTO EMISION. |
| Tercero seleccionado para pago | Se reutiliza su CHEQUE, pasa a ENDOSADO y agrega CHEQUEEVENTO ENDOSO. |

Seleccionar de cartera utiliza OffCanvas md y selección múltiple de cheques TERCERO en CARTERA. Es una cartera del negocio: no se limita al cliente que entregó el cheque. Los cheques se usan por su importe completo y no se pueden editar desde su selección. La disponibilidad se valida nuevamente bajo bloqueo al guardar; los borradores no reservan instrumentos indefinidamente.

Los cheques propios exigen una cuenta propia del banco indicado. Los terceros nuevos exigen banco y cuenta libradora. La identificación normaliza separadores de la cuenta y compara números ignorando ceros iniciales para detectar duplicados, conservando el número ingresado para presentación. El alta de instrumentos se serializa por banco y se rechazan repeticiones en un mismo borrador. Los índices refuerzan la identidad y los reintentos no crean instrumentos adicionales.

El Comprobante de un cheque o transferencia nuevo identifica su operación de origen. Al reutilizar un cheque, su comprobante original se conserva y el evento de endoso lo vincula al nuevo pago. El tipo de instrumento depende de su tabla y de CHEQUE.Tipo, sin códigos de comprobante fijos.

No se reutilizan transferencias existentes: cada transferencia ya corresponde a una operación concreta. No se crea BANCOMOVIMIENTO al recibir/endosar un tercero ni al emitir un cheque propio. Su acreditación, depósito, débito y rechazo se incorporarán en Valores/Tesorería mediante eventos específicos.

## Importes y Cuenta corriente

Total de valores = efectivo + transferencias + cheques propios + terceros. Debe ser mayor que cero e igual a afectaciones + importe manual a cuenta. El cálculo utiliza decimales exactos, nunca Number para dinero.

Importe a cobrar/pagar se calcula desde las afectaciones. Adelanto recibido (cobro) o Anticipo entregado (pago) es manual y nunca se completa automáticamente con la diferencia. Neto es positivo y su dirección depende del comprobante.

Se genera un solo crédito de Cuenta corriente por el total, vinculado a CajaMovimiento. El listado principal de Cuenta corriente (datos y total) muestra solo filas con CajaMovimiento IS NULL. Los asientos internos de cobros, pagos y sus reversiones se conservan: continúan en los cálculos de saldo, detalle, pendientes, anticipos y trazabilidad; se consultan operativamente desde Cobros y pagos. No se filtra por la configuración actual del maestro del comprobante, que puede cambiar después de emitir un movimiento. Las afectaciones distribuyen su cancelación entre deudas: no vuelven a descontarse del saldo global. Por ejemplo: deuda 80, cobro 100, afectación 80 e importe a cuenta 20 producen crédito 100 y disponible 20.

ImporteACuenta conserva la intención original. DisponibleACuenta se consulta como total menos aplicaciones de una operación vigente; se presenta en Propiedades. Esta entrega registra anticipos; la pantalla para aplicarlos posteriormente a nuevas deudas se mantiene pendiente y no se simula con un cobro adicional.

## Reversión y cierres anteriores

Revertir exige motivo, versión vigente, caja abierta, comprobante de la misma cuenta/naturaleza Deuda/sentido contrario y número válido. Se genera una operación con fecha actual y una deuda nueva. El original conserva sus importes, estado físico CONFIRMADO, fecha y apertura; la interfaz deriva Revertido desde su vínculo. Los informes financieros deben sumar el original y su contramovimiento en sus respectivas fechas; no deben excluir el original por el estado visual derivado Revertido. La reversión tiene un enlace único al original y no se permite revertir nuevamente el original ni la propia reversión en esta entrega.

Las afectaciones históricas permanecen. Si había un importe a cuenta sin aplicaciones posteriores, se utiliza ese remanente para absorber esa parte de la nueva contradeuda, registrando una afectación adicional con fecha y responsable actuales. Ejemplo: deuda 80, cobro 100 y anticipo 20; al revertir se registra contradeuda 100, se absorben los 20 a cuenta y quedan 80 pendientes. No reaparece además la deuda original ni queda un anticipo utilizable tras devolverlo.

Las transferencias de la reversión registran el efecto bancario contrario en su cuenta original; no ejecutan transferencias en el banco. Los eventos de cheques permiten devolver un recibido aún en cartera, anular un propio aún emitido o recuperar un tercero endosado. Si existe cualquier evento posterior al de la operación original, se bloquea la reversión hasta resolver su circuito: no se recupera automáticamente un cheque que ya circuló.

Aperturas, cierres, confirmaciones y reversiones son transaccionales y auditados. SOLICITUD controla reintentos. La reversión usa la cuenta histórica del movimiento de Cuenta corriente, aunque se modifique después el maestro del comprobante.

## Prueba manual

1. Aplicar la migración, crear los comprobantes de ejemplo y sus numeradores si se desean sugerencias. Preparar Caja, Banco, Cuenta bancaria y Cliente activos.
2. En Cuenta corriente cargar una jugada por 50, otra por 30 y un premio por 100.
3. Entrar en Cobros y pagos y presionar Administrar caja en el toolbar. Abrir con saldo inicial conocido y presionar Usar caja: al cerrar el panel, el botón muestra su nombre y la grilla permanece vacía. Navegar o recargar conserva esa preferencia en la pestaña.
4. Nuevo cobro → comprobante y cliente SF; la caja aparece de solo lectura. Afectaciones → Afectar → seleccionar ambas jugadas, aplicar 40 y 30. Total 70. Cancelar el panel debe conservar el borrador anterior; confirmar lo incorpora.
5. Valores → agregar transferencia 40 y cheque de terceros 30, con banco/cuenta libradora/número. Neto 70, importe a cuenta 0. Guardar. El banco recibe 40; el cheque queda en cartera; quedan 10 pendientes de la primera jugada.
6. Nuevo pago → elegir el premio y afectar 30. Seleccionar de cartera → elegir el cheque recibido por 30. Guardar. El cheque pasa a endosado y no vuelve a ofrecerse.
7. Registrar un cobro con efectivo 100, afectación 80 e importe a cuenta manual 20. Propiedades debe mostrar inicial y disponible 20. No se debe guardar si los medios no coinciden con el Neto.
8. Registrar un pago con cheque propio: exige cuenta propia y deja el cheque emitido sin débito bancario inmediato.
9. Cerrar caja con contado igual al teórico; abrir la siguiente y revertir una operación sin eventos posteriores. Comprobar cierre anterior intacto, vínculo, nuevo movimiento y deuda recuperada. Un cheque utilizado posteriormente debe impedir la reversión de su recepción original.
10. Agregar una afectación parcial, reabrir Afectar y comprobar que no aparece; quitarla mediante la papelera y verificar que vuelve a ofrecer su pendiente real. La grilla de afectaciones no debe permitir editar importes.
11. Cerrar desde otra ventana la caja seleccionada, volver al formulario y comprobar selección invalidada, Guardar bloqueado y borrador conservado. Elegir otra apertura explícitamente desde el botón del toolbar de Cobros y pagos en el mismo módulo. Consultar Cuenta corriente y comprobar que no aparecen los cobros/pagos, pero sus pendientes y saldos permanecen correctos.
12. Verificar encabezados y navegación por enlaces y scroll entre todas las secciones; la columna lateral mantiene su fondo desde debajo del toolbar hasta el final, y sus enlaces permanecen sticky al llegar a Importes (franja superior en móvil, sin tapar los títulos). Comprobar el botón al cambiar o cerrar caja y el ancho lg igual al panel de pendientes. Verificar consulta por doble clic/Propiedades, permisos de lector, filtros y anchos móviles. Los demás listados deben seguir seleccionando una sola fila sin CheckBox visibles.

## Verificación interna

`npm run check`, `npm run test:integration` y `npm run test:integration:mariadb` incluyen la nueva validación, exactitud decimal e integración financiera. Las bases son descartables y no acceden a Hostinger. Se comprueban concurrencia sobre pendientes/instrumentos, reintentos, rollback real ante fallo de auditoría, anticipo, cierre inmutable, reversión, emisión y endoso. También se revisa el circuito en Chromium con interfaz, API y base reales.

Pendientes para próximas entregas: aplicación posterior y devolución parcial independiente de anticipos, depósito/acreditación/rechazo de cheques, conciliación bancaria, ajustes de diferencias de caja y correcciones de reversiones ya registradas. Ninguno se ejecuta implícitamente al confirmar una operación.

El ajuste de DropDown limita el desplazamiento de la opción activa a su propia lista. Evita que formularios largos en móvil desplacen la página y dejen las opciones fuera de pantalla; conserva la selección por mouse y teclado.

La revisión de experiencia de Caja movimiento no agrega migraciones ni tablas: solo requiere el despliegue normal del código, teniendo ya aplicada 0003. Las pruebas de integración cubren también las exclusiones de borrador antes de paginar, consultas de apertura cerrada/abierta, asientos internos conservados y saldos calculados sin filtrarlos.

El contorno de DataTable se aplica automáticamente en formularios, modales y OffCanvas. bordered permite forzarlo o desactivarlo; los listados principales conservan su presentación. La revisión de presentación no cambia las reglas de apertura, saldo o cierre ni agrega migraciones.


Las grillas de Afectaciones muestran solo Comprobante, Número de comprobante, Fecha e Importe afectado. Original y Pendiente se conservan en el contrato/borrador y pueden consultarse en Propiedades; no son editores ni se modifican sus cálculos. Valores y los selectores de pendientes/cartera también incluyen Propiedades desde DataTable. Las fechas de listados y detalles de cheques utilizan el mismo formato dd/MM/yyyy. Cuenta corriente comparte FormSections con Datos generales e Importes, sin alterar los controles ni la validación de su alta/consulta.

Prueba de esta revisión: seleccionar otra fila de caja y cerrar el panel no debe cambiar el botón del listado; Usar caja sobre otra apertura muestra confirmación. Cancelar conserva la activa y Confirmar la sustituye. Consultar Propiedades en las sublistas y selectores, comprobar que los importes y CheckBox quedan iguales al cerrar, y que fechas/números se presentan con sus formatos. En Cuenta corriente probar los dos enlaces y scroll en escritorio y móvil.
