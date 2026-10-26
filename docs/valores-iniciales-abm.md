# Valores sugeridos en formularios y filtros

Ajuste de inicialización y presentación. Sin cambios de esquema, endpoints, reglas financieras ni variables de entorno. No requiere migraciones o comandos nuevos de SSH. No se aplica ningún valor inicial sobre los datos de un registro existente.

## Cuenta corriente

- La ficha Importes se alinea a la izquierda. Conserva ancho compacto, label/valor en fila en escritorio y ancho disponible en móvil.
- Al crear se calculan una vez Fecha de origen y Fecha de vencimiento con todayISO() (fecha civil de Argentina), y se inicializa Importe con cero, presentado como 0,00.
- Ambas fechas y el importe son editables. Vaciar el importe no repone automáticamente el cero. La API conserva el requisito de importe mayor que cero y vencimiento no anterior al origen.
- Al consultar se utilizan las fechas e importe del movimiento, incluido vencimiento NULL; no se sustituyen por hoy o cero.

## Filtros y carga manual

El estado de Cuenta corriente se inicializa al entrar con Desde/Hasta = hoy y Estado = CONFIRMADO. La grilla permanece vacía: se consulta solo al aplicar filtros o Actualizar, utilizando esos valores.

El helper de UI initialListFilters(emptyFilters, dateKeys, operationStateKey?) es reutilizable para los próximos módulos. Los campos de fecha indicados se inicializan con la fecha actual; el parámetro opcional de estado establece CONFIRMADO solo para módulos operativos. Los maestros conservan sus estados Activo/Inactivo/Todos.

El módulo debe utilizar el helper en la inicialización de su estado, de manera que Actualizar respete las mismas sugerencias aunque nunca se abra el modal. FilterDialog también propone hoy para fechas ausentes; los valores aplicados explícitos, incluidos vacíos, siempre tienen prioridad.

Limpiar usa una configuración independiente: fechas vacías y todos los estados. No consulta hasta Aplicar; Cancelar mantiene los filtros anteriores. Reabrir el modal conserva lo aplicado y no vuelve a insertar la fecha ni Confirmado. Los controles de fecha se reinician al limpiar para descartar borradores parciales. Regresar al módulo reinicia las sugerencias y mantiene la carga manual.

Los movimientos de otro día y los anulados pueden no aparecer con los filtros sugeridos: cambiar las fechas/estado o Limpiar y aplicar para consultarlos.

## Números y SF

AmountBox y TextBox type number admiten initialValue (por defecto "0"). Para usar esa inicialización se omite value o se entrega undefined y se recibe el valor en onValueChange una única vez. Un valor explícito de edición o una cadena vacía nunca se reemplazan. En un formulario controlado puede inicializarse directamente el estado con defaultNumericValue o el valor específico del módulo.

AmountBox representa el cero con format/locale: 0,00 con dos decimales; 0,000 con tres; 0 sin decimales. No altera la máscara ni los límites del formulario.

En MasterForm, los campos kind integer de un alta parten de cero si no declaran otro field.defaultValue. Los campos identity/autogenerados quedan excluidos. La edición conserva el registro completo y sus vacíos. No cambia el Código automático de clientes, las PK ni la emisión de números de comprobantes.

SF muestra «Ingrese un valor para buscar...» cuando está vacío. placeholder permite reemplazarlo por módulo y ClientSearch lo propaga. Escribir, seleccionar o limpiar conserva el funcionamiento de la búsqueda y la identidad asociada.

## Archivos principales

- controls/numeric-defaults.ts, useNumericInitialValue.ts, TextBox.tsx y AmountBox.tsx: inicialización compartida y configurable.
- controls/date-value.ts y ui/filter-defaults.ts: fecha civil actual y valores iniciales de filtros.
- controls/SearchField.tsx y current-account/ClientSearch.tsx: placeholder configurable.
- masters/MasterForm.tsx y ui/FilterDialog.tsx: adopción en las bases de formulario y filtros.
- current-account/CurrentAccountForm.tsx, CurrentAccountPage.tsx y current-account.css: sugerencias y alineación.
- tests/form-defaults.test.ts: zona horaria, estados operativos/maestros, limpieza separada, códigos/PK y formatos de cero.

## Cómo probar

1. Entrar a Cuenta corriente: no se deben cargar registros. Abrir filtros: ambas fechas muestran hoy y Estado Confirmados. Cancelar no consulta; Actualizar utiliza esos filtros.
2. Limpiar y aplicar: fechas vacías y Todos. Reabrir: deben seguir vacías/Todos. Navegar a otro módulo y volver: hoy/Confirmados se sugieren otra vez sin cargar la lista.
3. Agregar un movimiento: ambas fechas en hoy, Importe 0,00, SF con placeholder e Importes a la izquierda. Modificar o vaciar valores: no deben reponerse solos.
4. Consultar un movimiento anterior: fechas e importe históricos intactos. Revisar Comprobantes: Orden en cero al crear y valor existente al modificar.
5. Para otro valor numérico inicial, configurar initialValue o field.defaultValue. Verificar también que los ID generados y códigos automáticos no pasan a cero.

Validación focalizada: 32 pruebas unitarias/HTTP, comprobación de tipos del frontend y navegador con componentes fuente/servicios simulados. Se verifican inicialización única, valores existentes, vacíos, filtros/limpieza, ausencia de carga inicial, parámetros de Actualizar, fechas y alineación. No se ejecutó build de producción ni se usó la base de Hostinger.
