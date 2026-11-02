# Listado de saldos y Resumen de Cuenta corriente

Los dos informes reutilizan ReportView y los [criterios comunes de Informes](criterios-informes.md). No se agregan tablas, columnas, migraciones, dependencias ni escrituras financieras.

## Listado de Cuenta corriente

Informe de saldos por cliente, antes llamado Resumen. Conserva URL `/informes-cuenta-corriente`, API `GET /api/informes/cuenta-corriente` y permiso `informes-cuenta-corriente`.

- Tipo de cliente es el primer filtro opcional (Todos), mediante DropDown con tipos activos/históricos. Consulta la clasificación actual del maestro.
- Cliente es secundario y opcional, mediante SF. La búsqueda se limita al tipo elegido; cambiar Tipo limpia Cliente.
- Mantiene Código, Cliente, Saldo por cobrar, Saldo por pagar y Saldo neto. Pendiente documental y créditos sin aplicar siguen en Propiedades. No hay KPI.
- No cambian las fórmulas ni filtros de saldos. Se aplica el modo continuo común, sin páginas visibles; los anulados ya estaban excluidos del saldo.

## Resumen: mayor de un cliente por período

URL `/resumen-cuenta-corriente`; API `GET /api/informes/cuenta-corriente/resumen?Cliente=CODIGO&continuo=1&Desde=2026-11-01&Hasta=2026-11-30`.

Cliente es obligatorio, validado mediante SF, incluyendo clientes inactivos con historia. Fecha desde/Fecha hasta usan DatePicker: al abrir sugieren hoy menos 30 días calendario y hoy, respectivamente, en la zona horaria del negocio. Se pueden modificar o limpiar; la API valida fechas civiles reales y Desde ≤ Hasta. Los extremos son inclusivos para el detalle.

Sin Desde se consulta desde el inicio y Saldo anterior es cero. Sin Hasta se incluye todo lo posterior a Desde y Saldo a vencer no agrega importes. Siempre se mantienen orden Fecha de origen/ID numérico ascendente y saldo estable.

### Distribución temporal acordada

Todas las agrupaciones excluyen ANULADOS y utilizan **Fecha de origen**, no Vencimiento:

1. **Saldo anterior:** suma los débitos y créditos de movimientos anteriores a Desde. Su acumulado es Débito anterior − Crédito anterior.
2. **Detalle del período:** movimientos entre Desde y Hasta. Cada acumulado parte del saldo anterior.
3. **Saldo a vencer:** suma los débitos y créditos de movimientos posteriores a Hasta. Su Saldo acumulado continúa el cierre: Saldo al cierre + Débito posterior − Crédito posterior. Coincide con el neto actual de todo el cliente mostrado en el Listado.
4. **Totales del período:** Débito y Crédito solo de ese intervalo; Saldo acumulado es el saldo al cierre = Saldo anterior + Débito del período − Crédito del período. Permanece al final, sin sumar importes posteriores.

«Saldo a vencer» es la denominación acordada para **movimientos posteriores por fecha de origen**. No representa el pendiente de documentos por fecha de vencimiento ni una nueva deuda. No se restan afectaciones nuevamente.

Las filas Saldo anterior y Saldo a vencer tienen texto solo en **Comprobante**; Fecha, Número, Cuenta, Detalle y Estado quedan vacíos. Únicamente Débito, Crédito y Saldo acumulado presentan importes. No son operaciones seleccionables. Ambas se presentan como detalle: fondo blanco, tipografía y espaciado normales. Cada una se oculta cuando su **saldo propio** es cero, aunque sus débitos y créditos brutos no sean cero o el acumulado de todo el cliente sea distinto de cero. La fila de totales también usa esa disposición de columnas y es la única fila de datos con estilo destacado.

Ejemplo: anteriores Débito 100/Crédito 0 → acumulado 100; período Débito 20/Crédito 5 → cierre 115; posteriores Débito 40/Crédito 10 → Saldo a vencer muestra 40, 10 y acumulado 145, seguido por Totales del período: 20, 5 y 115. No sumar nuevamente los importes de las filas informativas al total del período.

Si el período está vacío, se muestran únicamente los saldos propios distintos de cero y sus totales. Si no hay detalle, saldos ni importes relevantes, la tabla queda sin filas. El Resumen no presenta mensajes ni filas vacías dentro de la tabla, tampoco antes de consultar; los errores siguen informándose fuera de ella. El Listado mantiene sus mensajes habituales. Las aclaraciones debajo de ambos informes se conservan.

### Convención de Débito/Crédito

El neto mantiene **Saldo de Cobrar − Saldo de Pagar**. No compensa automáticamente esas cuentas.

| Cuenta | Naturaleza guardada | Ejemplo | Columna |
|---|---|---|---|
| Cobrar | Deuda | Apuesta o deuda por cheque rechazado | Débito |
| Cobrar | Crédito | Cobro, anticipo o crédito manual | Crédito |
| Pagar | Deuda | Premio pendiente | Crédito |
| Pagar | Crédito | Pago de premio | Débito |

Se lee Cuenta/Naturaleza del asiento guardado, sin inferirlas desde una configuración de comprobante modificable. Propiedades muestra también saldos acumulados separados de Cobrar/Pagar.

### Vigencia y trazabilidad

- Una fila por asiento real: movimientos manuales, créditos internos de cobros/pagos, contradeudas de reversión y deudas por rechazo.
- Los anulados se excluyen completamente, tanto del detalle como de las tres agrupaciones temporales. Permanecen en ABM/auditoría.
- El original revertido conserva su efecto y la contrapartida se incorpora en su propia fecha. Si uno queda fuera del intervalo, se refleja en Saldo anterior o Saldo a vencer según corresponda.
- Afectaciones e instrumentos se consultan en Propiedades como información relacionada, sin otra incidencia monetaria. Las operaciones anuladas tampoco se muestran en esas relaciones del informe.
- Las aplicaciones de originales revertidos siguen el circuito vigente: no se reabre además el documento original al generar una contradeuda.
- El importe de cada cheque/transferencia es el total del medio, no una porción atribuida a ese documento. Se muestra su estado actual. La historia bancaria completa permanece en Valores.
- Depósito y acreditación no vuelven a afectar Cuenta corriente. El rechazo identifica el cheque y su Recibo original y aporta su asiento de deuda.
- Tesorería interna no aparece porque no genera asiento comercial de cliente.

La consulta utiliza **estados vigentes al consultar**. Las fechas clasifican los movimientos actuales; no reconstruyen lo que se veía antes de una anulación posterior. Esa reconstrucción histórica sigue pendiente.

### Consistencia y escala

La consulta usa un snapshot de solo lectura para cliente, filas, totales, agrupaciones y relaciones. La ventana calcula todos los asientos antes de recortar el detalle por fechas o la paginación compatible de API. Las relaciones 1:N se resuelven aparte en lotes, sin multiplicar importes ni generar listas IN ilimitadas.

`continuo=1` devuelve todos los registros del intervalo, aunque se envíen pagina/limite. ReportView muestra bloques de 200 mediante scroll automático, sin nuevas consultas ni botones de página. Toda la respuesta queda en memoria y las filas ya presentadas permanecen montadas; no es virtualización. No existe truncamiento silencioso. El Listado conserva orden remoto sobre la colección completa.

## Permisos y menú

El Listado conserva su permiso y URL. El nuevo Resumen requiere `resumen-cuenta-corriente`, de consulta. Administrador accede automáticamente; los demás usuarios se habilitan desde Usuarios. Las referencias auxiliares no conceden acceso a otros ABM o escrituras.

El menú sigue como acordeón exclusivo con 18 px de sangría en modo expandido/móvil; no cambia en esta entrega.

## Archivos principales

- Backend: `apps/api/src/reports/{ledger,store,validation,policy}.ts`.
- Contratos: `packages/shared/src/reports.ts`.
- Interfaz: `apps/web/src/components/reports/{ReportView,AccountLedgerPage,AccountSummaryPage}.tsx`, `reports.css`.
- Tabla base: `apps/web/src/components/ui/DataTable.tsx`, con continuación opcional y saldos informativos configurables. Los ABM no habilitan esa continuación y mantienen su presentación/paginación.
- Verificación: `tests/integration/account-ledger.test.ts`.

## Prueba de aceptación

1. Abrir cada informe: modal inicial y ninguna consulta hasta Aceptar. Cancelar la primera vez deja vacío; cancelar después conserva resultados.
2. Listado: probar Tipo/Cliente y orden, sin cambios de fórmulas. Sin KPI, tarjeta descriptiva ni paginación. Confirmar Propiedades.
3. Resumen: Cliente obligatorio por lupa; Fecha desde = hoy menos 30 días y Fecha hasta = hoy, ambas modificables/limpiables (01/11/2026 → 02/10/2026 a 01/11/2026). Un rango invertido no consulta.
4. Cargar el ejemplo 100 anteriores, 20/5 en período y 40/10 posteriores. Revisar saldo anterior 100, cierre 115 y acumulado de Saldo a vencer 145; el Listado debe dar 145. Los débitos/créditos del período no incluyen saldos anterior/posterior.
5. Revisar que los rótulos de las filas informativas estén solo en Comprobante y sus restantes datos solo en las tres columnas monetarias.
6. Anular movimientos anteriores, dentro y después del rango: no deben aparecer ni incidir en sus sumas. Revertir un cobro de jornada cerrada: original y contrapartida se conservan en sus fechas, sin doble compensación.
7. Consultar cobros con varias afectaciones/medios, anticipos, créditos manuales y cheques rechazados. Propiedades informa relaciones vigentes; cada asiento incide una vez.
8. Probar período sin movimientos, límites inclusivos y fechas vacías. Sin Hasta no se suman importes posteriores; sin Desde no se suman anteriores. Ocultar cada saldo cero, verificar ambos saldos negativos y un saldo posterior cero con acumulado distinto de cero; un cliente sin información debe dejar la tabla sin filas ni mensajes.
9. Con más de 200 movimientos, bajar por scroll hasta el final: deben agregarse automáticamente todas las filas y luego el pie. Actualizar reinicia al comienzo. No deben aparecer botones de página. El orden visible es Saldo anterior → detalle → Saldo a vencer → Totales del período, omitiendo los saldos cero.
10. Revisar saldos como detalle blanco y colores iguales en encabezados/totales, scroll horizontal dentro de la tabla y ausencia de desborde de página en móvil. Mantener permisos de usuarios limitados.

Las pruebas financieras se ejecutan en MySQL/MariaDB aislados; el navegador con API simulada comprueba presentación y flujos. No se ejecutan comandos sobre producción y Safari/iPhone real queda para la aceptación del cliente.

El ajuste posterior de visibilidad, orden, estilos y valores iniciales es únicamente de interfaz; no modifica consultas ni fórmulas. Según lo solicitado, no se ejecutan compilaciones ni pruebas para ese ajuste.
