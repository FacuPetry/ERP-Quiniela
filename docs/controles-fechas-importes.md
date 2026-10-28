# Fechas, importes y botones del SF

Revisión de la biblioteca de controles. No cambia tablas, migraciones, variables, endpoints ni reglas comerciales. Se publica con el despliegue habitual y se recarga el navegador; no requiere comandos adicionales de MySQL o SSH.

## DatePicker

Reutiliza Field y los estilos base. Presenta un textbox dd/MM/yyyy y un calendario nativo a su derecha, integrado con bordes y fondo verde. El calendario sigue siendo el control date del navegador; el textbox permite una entrada manual independiente de la configuración regional del navegador.

El consumidor entrega `value` yyyy-MM-dd o vacío y recibe ese mismo contrato mediante onValueChange. La fecha civil no se convierte a Date/UTC para almacenarla. En fechas opcionales, el módulo conserva su adaptación de vacío a NULL. Acepta size sm/md/lg/xl, label, required, errores, ayuda, readOnly y disabled. En consulta el texto es de solo lectura y el calendario queda deshabilitado.

Al salir del textbox normaliza:

| Entrada | Presentación (año actual 2026) |
|---|---|
| 31 12, 31-12, 31/12 | 31/12/2026 |
| 31 12 25, 31-12-25 | 31/12/2025 |
| 31/12/2025 | 31/12/2025 |
| 29/2/24 | 29/02/2024 |
| 31/02/2026, letras o caracteres ajenos al formato | Vacío |

Sin año utiliza el año actual de Argentina; dos dígitos significan siempre 2000 a 2099. Cuatro dígitos permiten años 1000 a 9999, conservando el rango de la API. Valida días por mes y años bisiestos (1900 no lo es, 2000 sí). Permite espacios, guiones o barras entre partes. No interpreta fechas ambiguas en orden mes/día ni cambia fechas imposibles al mes siguiente.

Mientras se edita, un texto inválido ya deja vacío el valor asociado para impedir que un Guardar inmediato use la fecha anterior. Al salir también se limpia visualmente. Los campos obligatorios y el vencimiento anterior al origen siguen siendo validados por Cuenta corriente/API.

Usos actuales: Fecha de origen y Fecha de vencimiento de Cuenta corriente, Desde/Hasta de su modal y campos kind date del FilterDialog reutilizable.

## AmountBox

Textbox monetario reutilizable con Field y los mismos anchos, altura, bordes, foco y estados de TextBox. Alinea el número a la derecha. La ficha Importes es compacta, alineada a la izquierda en escritorio y con ancho disponible en móvil, sin imponer una altura o tipografía distinta al control.

- `value` y onValueChange utilizan texto decimal canónico con punto, sin separadores de miles ni símbolos: 1250.50. Este contrato conserva precisión y el uso actual de DECIMAL en la API; no usa Number ni parseFloat sobre importes.
- `format` predeterminado: `#,##0.00`. Los ceros después del punto determinan los decimales; `0.00` omite miles, `#,##0.000` presenta tres decimales y `#,##0` ninguno. Admite hasta veinte decimales obligatorios. La puntuación de la máscara es convencional, no el separador que se teclea.
- `locale` predeterminado: es-AR. Determina los separadores visibles; por ejemplo en-US muestra 1,250.50.
- Admite las propiedades comunes de Field, size, required, readOnly y disabled. `maxIntegerDigits` limita los dígitos enteros según la necesidad del módulo.
- Al salir normaliza y formatea. Al enfocar muestra el valor sin miles ni ceros decimales de relleno, conservando los decimales significativos: `1.000,00` se edita como `1000`, y `1.250,50` como `1250,5`. Mantiene la selección inicial completa y permite ubicar el cursor para insertar/borrar en cualquier parte. Los estados intermedios de escritura no se sobreescriben por la actualización del valor controlado. Enter valida sin reinsertar agrupaciones mientras continúa el foco.
- Pegar un importe completo válido también lo lleva a la vista de edición; las inserciones parciales mantienen el comportamiento nativo del input. Un importe inválido queda visible para corregir y no conserva internamente el importe anterior. En consulta readOnly/disabled se mantiene el formato y no se aceptan cambios mediante pegado.

| Entrada es-AR | Valor interno | Presentación |
|---|---|---|
| 1000 | 1000.00 | 1.000,00 |
| 1250,5 | 1250.50 | 1.250,50 |
| 1500000,75 | 1500000.75 | 1.500.000,75 |
| 1.000,25 | 1000.25 | 1.000,25 |
| 1000.5 | 1000.50 | 1.000,50 |

En Argentina, un punto con grupos completos de tres cifras se interpreta como miles: 1.000 significa mil. Sin agrupación válida se acepta también el punto decimal de entrada, como 1000.5. El valor recibido por props es siempre canónico y no se vuelve a interpretar como entrada regional.

No redondea cifras significativas excedentes. Por ejemplo 12,345 con dos decimales queda visible para corregirlo, informa el error y entrega vacío en lugar de un importe válido. Los ceros decimales sobrantes pueden normalizarse sin pérdida de valor. Letras, símbolos, notación científica y agrupaciones inválidas tampoco producen un importe válido. Los importes negativos pueden representarse en el control; la condición positiva corresponde al módulo. Cuenta corriente conserva su rechazo de cero/negativos, máximo 16 enteros y dos decimales. Configurar otro formato no modifica restricciones de la API.

Uso actual: Importe en altas y consultas de Cuenta corriente. No se duplican controles por módulo ni se cambia el valor de la base.

## SF

La fila une input, Buscar y Limpiar sin espacios. Los botones tienen borde, fondo verde suave, hover y foco visibles, con la altura común. El borde exterior mantiene las esquinas redondeadas y comparte un único contorno de foco con los botones. También se aplica al input/botón de búsqueda del selector.

Se mantienen las búsquedas, selección, paginación, validación de identidad, limpieza, cancelación de respuestas tardías y error por cero coincidencias.

## Archivos

- `components/controls/DatePicker.tsx`, `date-value.ts`, `date-picker.css`: fecha manual y calendario.
- `components/controls/AmountBox.tsx`, `amount-value.ts`: entrada y formato monetario sin pérdida de precisión.
- `controls/index.ts`, `controls.css`, `components/Icon.tsx`: exportaciones, estilo común e icono de calendario.
- `components/controls/search-field.css`: botones integrados del SF; su lógica no cambia.
- `components/current-account/CurrentAccountForm.tsx`, `CurrentAccountPage.tsx`, `current-account.css` y `components/ui/FilterDialog.tsx`: adopción de controles.
- `tests/date-amount-controls.test.ts`: ejemplos, fechas inválidas, bisiestos, precisión, formato configurable y entradas monetarias inválidas.

## Prueba de usuario

1. Agregar un movimiento de Cuenta corriente. Escribir cada ejemplo de fecha y salir con Tab: verificar el formato, año asumido y limpieza de fechas imposibles/letras.
2. Usar el icono de calendario: seleccionar una fecha y comprobar el textbox. En consulta no debe permitir modificarla. Probar también Desde/Hasta del modal de filtros y Limpiar.
3. En Importe ingresar los ejemplos, salir con Tab y verificar miles/coma/dos decimales. Reemplazar un valor anterior, copiar/pegar 1.000,25 y comprobar que no se mezclan los valores.
4. Ingresar 12,345: debe informar exceso de decimales sin redondear ni guardar un valor anterior. Cero/negativos siguen rechazados por Cuenta corriente.
5. Completar un movimiento válido y guardar. Consultar: fecha dd/MM/yyyy e importe formateado, conservando ISO y decimal canónico en la solicitud. Guardado, numeración, consulta y anulación mantienen su circuito.
6. Probar Buscar/Limpiar del SF, cero/una/múltiples coincidencias, teclado y móvil. Los botones deben verse unidos y conservar el comportamiento.

Verificación automática: tipos, build, pruebas unitarias/HTTP y Chromium contra API y MariaDB efímeras. No se utilizan datos ni credenciales de Hostinger.

La revisión de [foco y Safari](foco-controles-safari.md) establece entradas móviles de 16px como mínimo y mantiene el zoom manual habilitado.


## Revisión de edición y neto de Caja

El problema de agregar un cero a un importe agrupado provenía de mantener los puntos de miles dentro del texto editable. Una cadena como 1.0000 ya no es una agrupación válida y puede confundirse con la alternativa de entrada decimal con punto. Se separa la presentación de la edición, sin relajar las validaciones del parser ni redondear importes. El valor que reciben los módulos sigue siendo el mismo decimal canónico exacto; no cambian la API, DECIMAL ni los registros guardados.

CashForm reubica el control Neto debajo de Valores de terceros, dentro de la columna Medios de pago. La columna Aplicación conserva Importe a cobrar/pagar, Adelanto recibido o Anticipo entregado y el aviso de diferencia. No cambian cálculos ni guardado; en móvil ambas columnas se apilan como antes.

Prueba: cargar 1000, salir y verificar 1.000,00; volver al campo, ir al final, agregar 0 y salir: 10.000,00. Repetir insertando/borrando en el medio, pegando un importe completo con miles/coma y con máscaras de cero/tres decimales o región en-US. Un exceso significativo de decimales conserva el error; corregirlo vuelve a habilitar el importe válido. Revisar también solo lectura, límite de enteros y valores grandes. La revisión se verificó con 44 pruebas unitarias, tipos y el componente real en Chromium con API simulada; no se ejecutó compilación de producción ni integración financiera contra bases de datos para este ajuste.
