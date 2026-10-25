# Etapa 5: Cuenta corriente y SF

Primera entrega operativa de Cuenta corriente, sobre las 21 tablas existentes. No hay migraciones, tablas, campos ni variables de entorno nuevos. No se modifican las configuraciones guardadas de Comprobantes o Numerador.

## Alcance acordado

- Alta y consulta de movimientos manuales de deuda o crédito.
- Saldos actuales separados de Cobrar y Pagar por cliente.
- Anulación con motivo, usuario y fecha, conservando el movimiento y su número.
- Sin edición ni eliminación de movimientos guardados: para corregir, anular y cargar uno nuevo.
- Numerador opcional; su número es una sugerencia editable antes de guardar.
- Formato de comprobante `0000-00000000`. Sin Numerador, prefijo fijo `0000` y correlativo ingresado manualmente, de 1 a 99999999.

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

En la tabla se mantiene Numero como correlativo y Numeracion como FK opcional. El texto formateado se construye en la API; no se guarda el guion ni se agrega Serie a CUENTACORRIENTE.

- Sin Numerador: Numeracion NULL, prefijo visible 0000 y número manual.
- Con Numerador: se elige una serie activa del comprobante. Se proponen sus cuatro dígitos y el próximo número, editable antes de guardar. Se admiten series numéricas de una a cuatro cifras, completadas con ceros; por ejemplo, 1 se presenta como 0001.
- Las series alfabéticas o de más de cuatro cifras permanecen en Numerador, pero no se ofrecen para emitir en este formato. Una serie cuyo próximo número exceda ocho cifras no ofrece sugerencia válida; se puede elegir un número manual válido y no utilizado dentro de esa serie.
- El usuario puede ingresar únicamente el correlativo de hasta ocho cifras y salir del campo para completar el formato, o escribir el formato completo. Sin Numerador debe conservar 0000; con Numerador debe respetar el prefijo seleccionado.
- Abrir el formulario o consultar opciones no reserva ni consume números.
- Al confirmar, el backend controla duplicados por comprobante, prefijo y número, incluidos anulados y series equivalentes como 1/0001. El mismo número con otro comprobante es independiente.
- El Numerador seleccionado avanza dentro de la misma transacción: nunca retrocede y queda por encima de los números utilizados en esa serie. Si dos usuarios eligen el mismo número sugerido, una carga gana y la otra recibe el conflicto para elegir otro; no se cambia silenciosamente el número ingresado.
- El modo manual y una serie configurada como 0000 comparten el espacio de números. También se comprueban los números existentes de CAJAMOVIMIENTO.

Como la clave única existente admite NULL en Numeracion, el modo manual utiliza además GET_LOCK por base, código canónico de comprobante y prefijo antes de comenzar la transacción y comprobar duplicados. Con Numerador se bloquea también su fila. Las futuras escrituras de Cobros y pagos deben respetar este mismo protocolo para números compartidos con Cuenta corriente y actualizar el Numerador dentro de su transacción.

## Formulario y listado

Campos del alta: Cliente mediante SF, Comprobante, Numerador opcional, Número de comprobante, Fecha de origen, Vencimiento opcional, Cuenta y Naturaleza informativas, Importe y Observaciones. Los importes son positivos con hasta dos decimales; Crédito determina la disminución, sin importes negativos. Vencimiento no puede ser anterior a Fecha de origen. Las fechas utilizan controles nativos con Field; no se crea un DatePicker personalizado en esta entrega.

El listado comienza sin consultar. Aplicar filtros o Actualizar solicita los datos; no hay refrescos periódicos. Los filtros incluyen búsqueda general, cliente con búsqueda histórica, cuenta, estado y rango de fechas. Se muestran descripciones de las referencias, número formateado y estado, sin IDTabla. Se consulta una fila por selección y el botón del ojo o por doble clic.

Al filtrar un cliente se muestran sus saldos actuales. Se calculan sobre todos sus movimientos CONFIRMADO, sin aplicar los otros filtros del listado: DEUDA suma y CREDITO resta, por separado en COBRAR y PAGAR. No se descuentan nuevamente las afectaciones. Sin cliente seleccionado no se presenta un saldo global que mezcle distintas cuentas comerciales.

Guardar o anular actualiza los datos solamente si antes se había solicitado el listado. Volver a entrar al módulo comienza sin consultar.

## SF reutilizable

`SearchField<T>` recibe la función de búsqueda, las columnas de resultados, cómo obtener código y descripción, el registro seleccionado y su callback. No conoce tablas ni endpoints.

- Lupa o Enter realiza la búsqueda; escribir o entrar al formulario no consulta automáticamente.
- Cero coincidencias informa el resultado; una selecciona automáticamente; varias abren una ventana de selección.
- La ventana reutiliza Modal, DataTable y Pagination, sin acciones de ABM. Permite buscar, paginar, seleccionar y confirmar o elegir por doble clic; Escape/Cancelar cierra.
- Editar el criterio invalida la selección anterior, evitando enviar una FK que ya no corresponde a lo escrito. Se cancelan respuestas anteriores al iniciar otra búsqueda o desmontar el componente.

`ClientSearch` es el adaptador de Cuenta corriente: reutiliza la búsqueda del maestro de Clientes, incluidos código y nombre. Ofrece activos para altas e incluye históricos para filtros. El resto del diseño y comportamiento pertenece al SF genérico. Otros módulos podrán aportar otra fuente y columnas sin crear un nuevo control visual.

## Confirmación, anulación e integridad

Las altas y anulaciones requieren ADMIN y CSRF; los demás usuarios activos pueden consultar. La interfaz no ofrece modificar o eliminar movimientos financieros. La API tampoco expone esas operaciones.

La confirmación inserta movimiento, actualiza Numerador cuando corresponde y registra AUDITORIA en una sola transacción. SOLICITUD controla reintentos mediante usuario, acción, clave y huella del contenido: reenviar la misma operación devuelve el resultado guardado sin duplicarla; reutilizar la clave con otro contenido se rechaza. El frontend conserva la clave mientras reintenta el mismo contenido.

Anular exige motivo y la versión actual. Solo se admiten movimientos manuales confirmados sin CajaMovimiento ni afectaciones relacionadas. No se eliminan registros ni se retrocede el Numerador. Las reglas posteriores de corrección de cobros/pagos se desarrollarán con esos módulos.

Los importes viajan como texto decimal y se suman en SQL DECIMAL. IDTabla y BIGINT se transportan como texto; no se convierten importes a Number. Las consultas de listado, cantidad y saldos se realizan en la misma transacción de lectura.

## API

- GET `/api/cuenta-corriente/opciones`: comprobantes compatibles y series activas; no emite números.
- GET `/api/cuenta-corriente`: filtros q, Cliente, Comprobante, Cuenta, Estado, Desde, Hasta, pagina y limite.
- GET `/api/cuenta-corriente/:id`: consulta y versión ETag.
- POST `/api/cuenta-corriente`: alta; requiere Idempotency-Key.
- POST `/api/cuenta-corriente/:id/anular`: motivo, If-Match e Idempotency-Key.

## Cómo probar

1. En Comprobantes configurar Jugada, Crédito a favor y Premio como en la tabla. Opcionalmente crear en Numerador una serie 0001 del comprobante Jugada con próximo número 1.
2. Entrar a Cuenta corriente: debe estar vacío y no consultar la grilla. Presionar Agregar y buscar un cliente por código o nombre con la lupa o Enter. Probar cero, una y varias coincidencias.
3. Elegir Jugada, dejar Sin Numerador, escribir 1 en el número y salir del campo: debe mostrarse 0000-00000001. Registrar importe 100,25 y guardar.
4. Actualizar y filtrar por ese cliente: Cobrar debe mostrar 100,25 y Pagar 0,00.
5. Cargar Crédito a favor por 30,05: Cobrar queda en 70,20. Cargar Premio por 200: Pagar queda en 200,00, sin cambiar Cobrar.
6. Cargar otra Jugada seleccionando la serie 0001. Verificar la sugerencia, ajustarla si se desea y guardar; abrir otro alta para comprobar el nuevo correlativo. Repetir el número con el mismo comprobante debe impedir el duplicado.
7. Consultar por doble clic y comprobar que no hay Guardar ni campos IDTabla. Anular un movimiento con motivo: permanece como Anulado y deja de integrar su saldo; su número no puede reutilizarse.
8. Navegar a otro módulo y volver: no se carga la grilla. Probar también en móvil y con un usuario de consulta.

Publicación: fusionar el PR y desplegar en Hostinger con la configuración vigente. No ejecutar migraciones nuevas, recrear usuarios ni cambiar variables. No se cargan ejemplos ni se accede a la base del alojamiento durante las pruebas de Codex.

## Verificación

`NODE_ENV=production npm run check`, integración en MySQL 8.4 y MariaDB 11.8.9 aislados y Chromium con API/base reales. Se verifican números manuales y sugeridos, concurrentes y anulados, idempotencia, rollback financiero ante fallas de auditoría, precisión de importes grandes, snapshots, permisos, saldos separados y el recorrido de SF. El runner ejecuta los archivos de integración en orden explícito para revisar la base vacía antes de insertar fixtures financieros.

Resultado: tipos y compilación correctos, 22 comprobaciones unitarias/HTTP y 36 de integración por motor (94 en total, contando las pruebas contenedoras). Chromium verificó el recorrido financiero y la regresión de los maestros, sin errores de JavaScript ni desbordamiento de página en 320/375/768/1280 px. Todas las bases utilizadas fueron efímeras.

## Pendiente

Cobros y pagos con medios de pago y afectaciones, Tesorería, Valores y aplicaciones entre créditos y deudas. DatePicker sigue pendiente; SF ya está disponible. Las anulaciones de operaciones financieras relacionadas se definirán junto con esos circuitos.
