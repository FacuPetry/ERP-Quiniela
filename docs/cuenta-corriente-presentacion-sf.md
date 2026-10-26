# Cuenta corriente: presentación y Search Field

Esta revisión no modifica tablas, migraciones, endpoints ni lógica financiera. Si ya se aplicó `0002_numero_comprobante_completo`, basta con publicar el nuevo frontend/backend mediante el despliegue habitual; no hay comandos SQL/SSH adicionales ni variables nuevas. No se publica en Hostinger desde Codex.

## Formulario

Comprobante es el primer campo y recibe el foco al abrir el alta, después de cargar sus opciones. Esta es la convención para los próximos formularios operativos que usen comprobantes; Numerador ya comienza por Comprobante. El orden del DOM mantiene la navegación con Tab.

Los datos generales son Comprobante, Número de comprobante, Cliente, fechas y Observaciones. Origen y vencimiento quedan apilados, alineados y con size sm. Cuenta y Naturaleza no se presentan en el formulario, ni en alta ni en consulta. El servidor sigue determinándolas y conservándolas desde la configuración del comprobante; los campos y columnas del listado mantienen su funcionamiento.

La ficha Importes es un fieldset con legend, siempre visible y con el Importe destacado. Una única ficha no necesita navegación de pestañas ni ocultar el campo obligatorio; se pueden incorporar más controles dentro del grupo sin cambiar el envío actual. Estado y motivo de anulación permanecen en la consulta. Los botones de cabecera se acomodan en otra línea si no hay espacio en móvil.

Se retiran únicamente las tarjetas de Cobrar/Pagar del listado. El cálculo DECIMAL, su alcance por cliente y la respuesta de la API se conservan para futuros informes. No se crea un módulo de reportes en esta entrega.

## Biblioteca de controles

`FieldProps.size` es un ancho máximo optativo centralizado en Field y controls.css:

| Tamaño | Máximo |
|---|---|
| sm | 12rem |
| md | 20rem |
| lg | 32rem |
| xl | 48rem |

Se reduce al espacio disponible. Sin size se conserva el diseño anterior. No altera alturas, validaciones ni contenidos. `wide` sigue controlando la ocupación de columnas y puede combinarse con size. MasterField permite configurar el tamaño de cada control del ABM; ReferenceSelect lo transmite a su DropDown. No se impone un tamaño nuevo a todos los maestros existentes.

SF utiliza el mismo Field para el label, acciones, ayuda y error. La lupa y la goma comparten la fila del input y se centran sin márgenes calculados desde el label. El valor visible seleccionado es `código - descripción`; getDescription devuelve la descripción sin repetir el código. El registro/identificador pertenece al estado controlado, no al texto mostrado.

- Escribir solo prepara el criterio; lupa o Enter buscan.
- Una coincidencia selecciona; varias abren el selector paginado; cero resalta el input en rojo claro y anuncia el resultado.
- Editar un valor seleccionado lo invalida inmediatamente. También se invalidan las filas y la selección del modal si se cambia el criterio, para evitar confirmar un resultado antiguo sin buscar.
- Limpiar borra texto, registro e identificador y el estado de error; devuelve el foco al input. Permite cancelar una búsqueda en curso: una respuesta tardía no vuelve a seleccionar el registro.
- Encontrar coincidencias retira el estado de no encontrado. Los errores de red no se presentan como ausencia de registros.
- El control no conoce Clientes ni reglas financieras. ClientSearch aporta la API, código, descripción y columnas; en filtros sigue admitiendo clientes históricos.

## Archivos principales

- `components/controls/Field.tsx`, TextBox, TextArea, DropDown y CheckBox: propagación de size sin enviarlo como atributo nativo.
- `controls.css`, `components/masters/MasterForm.tsx`, `ReferenceSelect.tsx` y `packages/shared/src/masters.ts`: dimensiones y configuración declarativa reutilizable. NumeroComprobante recibe size mediante sus FieldProps existentes.
- `components/controls/SearchField.tsx`, `search-field.css` y `components/Icon.tsx`: selección, formato visible, limpieza, estados y goma.
- `components/current-account/CurrentAccountForm.tsx`, `CurrentAccountPage.tsx`, `ClientSearch.tsx` y `current-account.css`: orden, campos visibles, ficha y resumen retirado.

## Cómo probar

1. Entrar en Cuenta corriente y Agregar. Comprobante debe ser el primer control y recibir el foco. Tab continúa por ambas partes del número y el SF.
2. Elegir comprobante: se mantiene la sugerencia del Numerador. No aparecen Cuenta ni Naturaleza como campos. Las fechas están una debajo de la otra; Importe está dentro de su ficha.
3. Escribir un código válido de cliente sin buscar y completar el resto: Guardar debe exigir una selección válida y no enviar una alta.
4. Presionar lupa con código o descripción únicos: el input muestra código y descripción. Modificar ese texto invalida el cliente hasta volver a buscar.
5. Buscar un criterio con varios registros, recorrer páginas y seleccionar uno. Editar el criterio dentro del selector debe deshabilitar Seleccionar hasta tener un nuevo resultado seleccionado.
6. Buscar algo inexistente: aviso, fondo rojo claro y aria-invalid. Buscar uno válido quita ese estado. Limpiar también lo retira y borra toda la selección; Guardar no puede usar el cliente anterior.
7. Durante una búsqueda pendiente, presionar Limpiar: al llegar la respuesta no debe restaurar el valor. Probar también Enter, Escape y cancelar/cerrar el selector.
8. Guardar, consultar por doble clic y anular con motivo. Se conservan importes, configuración del comprobante, numeración, anulados y permisos. Los filtros por cliente muestran movimientos sin tarjetas de saldos; el cálculo permanece en la API.
9. Revisar en 320, 375, 768 y 1280 px: sin desbordamiento de página, botones alineados, fechas compactas, grupo Importes legible y campos de solo lectura al consultar. Revisar los maestros previos para confirmar que los controles sin size conservan el ancho anterior.

Verificación: `NODE_ENV=production npm run check` y `npm run test:integration:mariadb`, más Chromium contra API/MariaDB efímeras. No se usan credenciales ni datos de Hostinger. Informes y DatePicker siguen pendientes.
