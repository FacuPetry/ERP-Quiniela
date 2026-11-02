# Criterios comunes de Informes

Estos criterios se aplican a los informes actuales y a los que se incorporen después. Los ABM operativos y la auditoría conservan sus consultas e historial completos.

## Vigencia de movimientos

**Los movimientos ANULADOS se excluyen de las filas, saldos, agrupaciones y relaciones informativas de todos los informes.** No se borran ni se modifica su estado. Las consultas de informes reutilizan `reportMovement(alias)` de `apps/api/src/reports/policy.ts`; el alias es una constante interna, nunca texto recibido del usuario.

Un original revertido no es un anulado: conserva su incidencia y se considera junto con la contrapartida confirmada. No filtrar por el estado visual Revertido ni descontar el original una segunda vez. Un estado distinto de Anulado no exime al informe de aplicar las demás reglas de vigencia de su dominio.

Cada importe financiero debe agregarse una sola vez desde su asiento real. Las relaciones 1:N —afectaciones, medios de pago, eventos— se consultan separadamente para información o se agrupan antes de unirlas; no multiplicar el asiento por cada relación.

## Consulta y presentación

- Usar `ReportView`, `Modal`, `ActionToolbar` y `DataTable`. No crear una tabla particular por informe.
- Abrir filtros al ingresar; no consultar hasta Aceptar. Cancelar conserva los últimos resultados aceptados. Actualizar repite esos criterios.
- Las parejas Fecha desde/hasta usan `initialDateRange()` de la base de filtros: hoy menos 30 días calendario y hoy, con la fecha civil del negocio. Son sugerencias iniciales modificables/limpiables; no se reponen al reabrir filtros aplicados.
- Antes de Aceptar no se muestran resultados ni totales. Después de una consulta válida vacía se conservan encabezados y el pie aportado por el informe, con ceros o valores reales; no se insertan mensajes como filas de detalle. Un error no se presenta como una consulta vacía.
- El título principal lo presenta Workspace. No agregar tarjetas descriptivas ni otro encabezado visible redundante.
- Mantener tabla limpia, sin divisorias de grilla, con encabezados y totales en el mismo verde suave. Fechas `dd/MM/yyyy`, importes a la derecha y scroll horizontal interno en móvil. Todo el detalle usa peso de letra normal, incluidas las últimas columnas y las filas de saldos; la base normaliza también etiquetas strong/b dentro del cuerpo. La negrita de las filas de datos queda reservada a los subtotales y al pie de totales.
- **Sin paginación visible:** la función `load` del informe recibe `ReportQuery.parameters` y debe enviarlo a la API (`continuo=1`). El servicio devuelve la colección completa y coherente con sus totales en un snapshot de solo lectura. No recorrer páginas de distintas consultas para armar un saldo.
- ReportView presenta 200 registros inicialmente y agrega bloques de 200 al acercarse al final del scroll. No realiza nuevas consultas al avanzar ni oculta registros por un límite fijo. El pie aparece al alcanzar el final. Esta es presentación progresiva, no virtualización: las filas ya mostradas permanecen en el DOM y la respuesta completa permanece en memoria.
- Para volúmenes extraordinarios se debe evaluar exportación o un snapshot paginado estable/virtualización. No introducir un recorte silencioso para aliviar la carga. En el Resumen, las fechas permiten acotar el detalle.
- Las APIs mantienen opcionalmente el contrato paginado anterior para compatibilidad; los informes de la aplicación siempre usan el modo continuo. Los ABM mantienen su paginación habitual.
- Totales y saldos se calculan como DECIMAL; viajar como texto, sin sumas monetarias mediante Number. Mantener orden estable y validar filtros/fechas y permisos en servidor.

## KPI opcionales

ReportView admite `kpis(data)` de forma optativa y ReportKpis centraliza las tarjetas, iconos, formato visual y adaptación móvil. Sin esa propiedad no se muestra ningún indicador. No se habilitan automáticamente para futuros informes ni se infieren desde nombres de columnas.

El informe aporta cada valor ya formateado desde la misma respuesta aceptada que alimenta la tabla; la base no suma importes. No se presentan indicadores antes de aceptar filtros, durante una carga nueva ni ante un error. Cancelar filtros conserva los indicadores de la última consulta aceptada. Una respuesta válida sin movimientos puede mostrar ceros; no se confunde con una consulta fallida.

Por decisión funcional, **solo Resumen de Cuenta corriente** configura tres KPI: Débitos/Créditos del período y Saldo total al cierre (saldo anterior + débitos − créditos del período). No incluye el saldo posterior de «Saldo a vencer». El Listado conserva su presentación sin KPI. La tipografía destacada de las tarjetas es independiente de la regla de texto normal del detalle de tabla.

## Filas informativas

DataTable admite saldos informativos antes y después del detalle (`openingBalance`/`closingBalance`) y un pie de una o varias filas (`totals`). `closingBalancePlacement` permite colocar el saldo final antes o después de Totales; por defecto mantiene antes, y el Resumen configura después para continuar visualmente el acumulado posterior al cierre. `labelKey` coloca el nombre en una columna concreta; las otras celdas quedan vacías salvo los valores configurados. Son filas informativas, sin selección ni Propiedades de una operación ficticia.

En el mayor de Cuenta corriente, «Saldo anterior» y «Saldo a vencer» llevan su nombre únicamente en **Comprobante**, y valores únicamente en **Débito, Crédito y Saldo acumulado**. Se muestran como detalle blanco solo si su saldo propio es distinto de cero; Totales del período es la única fila de datos destacada y aparece antes de Saldo a vencer, para mostrar primero el cierre y después el acumulado posterior. ReportView configura `showEmptyMessage=false` para todos los informes; los ABM conservan sus mensajes habituales. El pie se configura incluso para una respuesta válida sin detalle ni saldos. Consultar el [alcance y fórmulas del mayor](listado-resumen-cuenta-corriente.md).

## Agrupamiento opcional y cortes

ReportView admite `grouping.key(row)` y `grouping.subtotal(data, key)`. La base reúne los registros por identidad de grupo, conserva el orden de primera aparición y agrega el corte solo después de su última fila real en la colección completa. No agrega encabezados de grupo ni calcula dinero en el cliente. Un bloque de 200 filas que corta un grupo no genera un subtotal prematuro.

El informe debe devolver subtotales sobre todo el filtro desde el mismo snapshot que el detalle y el total general. DataTable presenta esos cortes como filas informativas no seleccionables; Informes les aplica el mismo estilo destacado que al pie. Resumen diario agrupa por código de Caja y ordena por descripción, sin mezclar cajas distintas que tengan igual nombre. Ver [contrato, límites y pruebas](filtros-caja-agrupamiento-informes.md).
