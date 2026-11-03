# Edición de importes y resultado del cierre de Caja

Ajuste de interfaz sobre los componentes existentes. Sin cambios de API, tablas, cálculo de saldos, numeración ni operaciones financieras. No requiere migraciones.

## AmountBox reutilizable

- Clic o touch conserva el texto formateado y el cursor nativo donde se pulsó. No desagrupa el número ni quita los decimales al recibir foco.
- Tab y Shift+Tab seleccionan todo el contenido para reemplazar el importe. Una escucha compartida distingue teclado, puntero y foco programático; no se agrega un juego de listeners por campo.
- Al insertar/borrar dígitos se reagrupa la parte entera y se remapea el cursor. Backspace/Delete atraviesan los separadores de miles sin dejar el cursor atrapado.
- Letras, dos separadores decimales, precisión significativa excedente u otros errores sintácticos vuelven a cero con la máscara configurada. El borrador vacío puede verse mientras se edita, con cero como valor interno; al salir o confirmar con Enter se muestra cero formateado.
- El pegado completo usa el parser estricto existente. En pegado parcial se valida el fragmento y se conservan ceros y selección; no se convierten agrupaciones inválidas o decimales fuera de lugar en miles.
- Se mantiene `#,##0.00`/es-AR por defecto. Con dos decimales el cero es `0,00`; con tres, `0,000`; sin decimales, `0`. La región configura los separadores. Los decimales se completan al confirmar; durante la escritura se conservan las cifras que se están editando.

El modelo continúa siendo una cadena decimal canónica exacta, por ejemplo `10000.00`, sin Number/parseFloat ni redondeo binario. `parseAmountInput` no cambia: conserva su contrato estricto para los demás usos. La conversión compacta `editAmount` se utiliza para normalizar fragmentos pegados, no para modificar la presentación al recibir foco.

La normalización a cero se aplica a la interacción del usuario, no a la carga de valores externos o históricos. ReadOnly/disabled conserva el valor recibido y no emite cambios. Tampoco se suprimen los errores financieros que aporta el formulario: un módulo que exige un importe positivo puede seguir rechazando cero. La edición no guarda datos por sí sola.

## Administrar cajas

El bloque **Último cierre** se ubica al final del OffCanvas, debajo del listado y del formulario de apertura/cierre. Conserva el mensaje de éxito, errores de emisión, descarga, abrir para imprimir y volver a emitir, con la misma apertura vinculada. No inserta contenido antes del listado ni cambia la lógica de cierre/PDF.

Saldo inicial vuelve a `0,00` después de abrir correctamente una caja y al cambiar o limpiar la selección del DropDown Caja. Una apertura fallida conserva el borrador para corregirlo/reintentar. No se modifica el saldo inicial de una apertura ya guardada ni el Efectivo contado del cierre.

## Archivos

- `apps/web/src/components/controls/AmountBox.tsx`: interacción, normalización, cursor y foco.
- `amount-edit.ts`: edición/pegado/confirmación de texto monetario con precisión exacta.
- `useTabFocus.ts`: detección compartida de entrada con Tab/Shift+Tab.
- `apps/web/src/components/cash-movement/CashActions.tsx`: resultado inferior y reinicio de saldo inicial.
- `tests/amount-edit.test.ts`: agrupación, caret, inválidos/cero, pegado, máscaras, regiones y valores grandes.
- `tests/date-amount-controls.test.ts`: conserva las pruebas del parser y aclara los nombres de las pruebas de la utilidad compacta.
- README, esta guía, controles monetarios y valores iniciales: documentación del comportamiento vigente.

## Cómo probar

1. Importe `1.000,00`: hacer clic en la parte entera antes de la coma, agregar un cero y comprobar `10.000,00`, sin salto del cursor al final. Probar insertar/borrar en el medio y reemplazar una cifra decimal.
2. Entrar con Tab y Shift+Tab: todo seleccionado y presentación intacta. Escribir `12,50` debe reemplazar el importe. Clic/touch no selecciona todo automáticamente.
3. Escribir/pegar letras o `10,,50`: cero formateado, sin error sintáctico propio del control. Borrar todo y salir: `0,00`. Probar el error de negocio por cero si el módulo requiere importe positivo.
4. Probar pegado `1.000,25`, entrada decimal alternativa `1000.5`, pegado parcial y precisión. Con otra máscara verificar `0`/`0,000`, y con en-US `0.00`. Consultar un registro existente: valor intacto.
5. Abrir una caja con saldo inicial distinto de cero: tras el éxito, el campo debe mostrar `0,00`. Cambiar de caja o limpiar su selección también lo reinicia.
6. Cerrar y emitir informe: el bloque Último cierre aparece al final. Descargar, abrir para imprimir y reemitir deben seguir utilizando la misma jornada. Revisar escritorio y móvil sin desborde horizontal de la página.

Verificación: **58 pruebas unitarias aprobadas**, tipos de la web y Chromium con controles reales en escritorio/touch. Se verificaron cursor, Tab/Shift+Tab, edición/pegado, normalización, máscaras/regiones, readOnly y errores del formulario. La revisión de Cajas usa API simulada y un PDF real; comprobó el saldo enviado en la apertura, su reinicio y las acciones inferiores del cierre. No se ejecutó build de producción ni pruebas contra bases de datos para este ajuste de interfaz.
