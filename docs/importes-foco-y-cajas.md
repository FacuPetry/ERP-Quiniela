# Edición de importes y resultado del cierre de Caja

Ajuste de interfaz sobre los componentes existentes. Sin cambios de API, tablas, cálculo de saldos, numeración ni operaciones financieras. No requiere migraciones.

## AmountBox reutilizable: formato solo en Blur

- Clic o touch conserva el texto formateado y el cursor nativo donde se pulsó. No desagrupa el número ni quita los decimales al recibir foco.
- Tab y Shift+Tab seleccionan todo el contenido para reemplazar el importe. Una escucha compartida distingue teclado, puntero y foco programático.
- Mientras se escribe, borra o pega se conserva literalmente el texto del navegador. No se agregan separadores de miles ni ceros, no se reemplaza el texto inválido y no se modifica la posición del cursor. El pegado, Backspace y Delete utilizan el comportamiento nativo.
- Solo al salir del campo (Blur) se valida el texto completo y se aplica la máscara. Letras, dos separadores decimales, agrupación inválida, precisión significativa excedente o vacío se convierten visualmente en cero. Enter no reformatea mientras el campo siga enfocado.
- Se mantiene `#,##0.00`/es-AR por defecto: `10000` pasa a `10.000,00` al salir. Con dos decimales el cero es `0,00`; con tres, `0,000`; sin decimales, `0`. La región configura los separadores.
- Se conserva el parser estricto existente: admite importes regionales completos (`1.000,25`) y la entrada decimal alternativa (`1000.5`). No reinterpreta agrupaciones inválidas; por ejemplo, `1.0000,00` vuelve a cero al salir. Para reemplazar todo el importe puede usarse la selección con Tab.

El modelo continúa siendo una cadena decimal canónica exacta, por ejemplo `10000.00`, sin Number/parseFloat ni redondeo binario. Durante la edición se actualiza con los textos válidos; un texto vacío o inválido emite cero para que un Guardar inmediato no utilice el importe anterior. Esto no cambia el borrador visible. `parseAmountInput` conserva su contrato estricto, precisión y límites; las validaciones financieras del módulo siguen aplicándose.

La normalización a cero se aplica a la interacción del usuario, no a la carga de valores externos o históricos. ReadOnly/disabled conserva el valor recibido y no emite cambios. La edición no guarda datos por sí sola.

## Administrar cajas

El bloque **Último cierre** se ubica al final del OffCanvas, debajo del listado y del formulario de apertura/cierre. Conserva el mensaje de éxito, errores de emisión, descarga, abrir para imprimir y volver a emitir, con la misma apertura vinculada. No inserta contenido antes del listado ni cambia la lógica de cierre/PDF.

Saldo inicial vuelve a `0,00` después de abrir correctamente una caja y al cambiar o limpiar la selección del DropDown Caja. Una apertura fallida conserva el borrador para corregirlo/reintentar. No se modifica el saldo inicial de una apertura ya guardada ni el Efectivo contado del cierre.

## Archivos

- `apps/web/src/components/controls/AmountBox.tsx`: borrador sin transformación, formato en Blur y selección al entrar con Tab.
- `amount-edit.ts`: separación del texto visible y el decimal canónico; confirmación al salir.
- `useTabFocus.ts`: detección compartida de entrada con Tab/Shift+Tab, sin cambios en esta revisión.
- `apps/web/src/components/cash-movement/CashActions.tsx`: resultado inferior y reinicio de saldo inicial, sin cambios en esta revisión.
- `tests/amount-edit.test.ts`: casos actualizados al formato en Blur, inválidos, precisión, máscaras y regiones.
- README y controles monetarios: documentación del comportamiento vigente.

## Cómo probar

1. Entrar con Tab, escribir `10000`: debe permanecer `10000` mientras se edita. Al salir debe mostrar `10.000,00`.
2. Escribir `1250,5`: conservar el texto hasta Blur y mostrar `1.250,50` al salir. Probar copiar/pegar `1.000,25` y `1000.5`.
3. Hacer clic/touch dentro de un importe: presentación intacta y cursor donde se pulsó. Insertar, borrar o pegar en el medio sin saltos ni reagrupación automática.
4. Entrar con Tab y Shift+Tab: todo seleccionado. Enter no debe aplicar el formato mientras se conserve el foco.
5. Escribir letras o `10,,50`, o borrar todo: el borrador permanece hasta salir; luego muestra `0,00`. Probar también una agrupación inválida y la validación de negocio por cero si el módulo requiere importe positivo.
6. Probar otras máscaras (`0`/`0,000`) y en-US (`0.00`). Consultar un registro existente: valor intacto.
7. Las acciones de Cajas siguen disponibles: reinicio del saldo tras apertura/cambio y resultado del cierre al final con descarga, impresión y reemisión de la misma jornada.

En esta revisión de formato exclusivo en Blur no se ejecutaron pruebas ni compilaciones, según lo solicitado. Se actualizaron los casos de prueba existentes al nuevo comportamiento para futuras ejecuciones. Las verificaciones de la revisión anterior no se presentan como validación de este cambio.
