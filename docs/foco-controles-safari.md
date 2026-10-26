# Foco integrado y Safari en iPhone

Ajustes de presentación sobre los controles base y Cuenta corriente. No cambian la base de datos, numeración, formatos internos, validaciones, API, autenticación ni el mecanismo de despliegue. No se requieren migraciones, variables nuevas ni comandos SSH adicionales.

## Controles compuestos

`control-group`, centralizado en controls.css, agrupa input y acciones/segmentos de SF, DatePicker y NumeroComprobante. El borde exterior y sus esquinas pertenecen al conjunto. Al enfocar cualquiera de sus elementos se dibuja un único contorno verde semitransparente de 2px con separación de 1px. Los hijos no dibujan otro contorno encima de los botones. Buscar, Limpiar y calendario reciben además una señal interna cuando tienen foco; los segmentos del comprobante diferencian la parte en edición.

Los controles simples también utilizan el contorno de 2px. Se conserva el foco visible para teclado, los bordes de error y una adaptación a colores forzados. No se elimina la indicación de foco globalmente ni se utiliza overflow hidden para recortarla.

NumeroComprobante mantiene los dos inputs: cuatro dígitos a la izquierda y ocho a la derecha, contiguos, sin guion visible y con divisor vertical. El ancho se ajusta a los dígitos. Conserva selección al enfocar, Tab/Shift+Tab, ceros al salir y pegado del formato completo con guion. El único BIGINT y las reglas de emisión no cambian; el listado sigue mostrando 0001-00000025. La ayuda explicativa bajo este campo se retira del formulario de Cuenta corriente; Field conserva su capacidad de ayuda para otros usos.

Importes conserva únicamente el importe editable: bloque compacto a la derecha debajo de los datos generales, con etiqueta a la izquierda y valor a la derecha. En móvil ocupa el ancho disponible y apila la etiqueta para dejar espacio al valor. No agrega artículos, totales duplicados ni cálculos.

## Fuente móvil y zoom

La fuente anterior era de 12px en los controles y 14px en el acceso. Son inferiores al umbral de 16px que puede activar el zoom automático de Safari iOS al enfocar entradas.

En pantallas de hasta 860px o con cualquier puntero táctil se usan fuentes de al menos 16px para entradas, incluidos los dos segmentos del número, SF, DatePicker y su calendario nativo, importes, textarea, filtros y acceso. La altura común pasa a 44px para dejar espacio al texto y a la interacción táctil. La condición táctil también cubre el iPhone en horizontal, aunque el ancho supere 860px. Escritorio con puntero fino conserva 12px/40px.

El viewport permanece `width=device-width, initial-scale=1.0`. No se añaden user-scalable=no, maximum-scale, minimum-scale ni transformaciones para encoger los inputs. El zoom manual sigue habilitado.

## Cómo probar en iPhone 15 Pro Max

1. Desplegar la revisión del PR y recargar la aplicación en Safari. Si la pestaña quedó ampliada por las pruebas anteriores, volver una vez al zoom normal; si persisten estilos anteriores, cerrar esa pestaña y abrir el sitio actualizado.
2. En Cuenta corriente agregar un movimiento. Tocar SF, ambas fechas, las dos partes del número, Importe y Observaciones. Comprobar que el texto se lee sin necesidad de acercarlo y que Safari no amplía automáticamente al pasar de uno a otro.
3. Repetir en horizontal. Probar también los filtros, Clientes/Tipos de cliente y los campos de acceso. Verificar que los números y botones entran sin desplazamiento horizontal de la página.
4. Hacer zoom con dos dedos y volver al tamaño normal: debe seguir permitido. Esta prueba comprueba que no se resolvió el problema bloqueando el viewport.
5. Revisar que el foco rodea SF/calendario completo y no invade sus botones. Con teclado externo, recorrer inputs y acciones con Tab/Shift+Tab y comprobar que se distingue el elemento activo.
6. Escribir y buscar un cliente, limpiar y volver a seleccionarlo. Editar ambas partes del número, fechas manuales/calendario e importe; guardar, consultar y anular. El circuito debe conservar sus resultados.
7. En escritorio, comprobar Número sin texto inferior ni guion entre inputs, guion conservado en la grilla y ficha Importes compacta con etiqueta/valor en una fila.

## Archivos y validación

- `controls.css` y `styles.css`: foco, grupo común y fuentes/tamaños táctiles.
- `controls/SearchField.tsx`, `DatePicker.tsx`, `NumeroComprobante.tsx` y sus CSS: uso del grupo y presentación de segmentos/acciones.
- `current-account/CurrentAccountForm.tsx` y `current-account.css`: ayuda retirada y bloque Importes compacto.
- Documentación de controles y Cuenta corriente actualizada.

Verificación: tipos, 30 pruebas unitarias/HTTP y build; navegador Chromium con API/MariaDB efímeras y WebKit 26.5 con perfil móvil iPhone 15 Pro Max. Se revisan fuentes calculadas, foco exterior sin anillos internos, geometría, valores completos y vista vertical/horizontal, además del recorrido financiero. La escala permanece 1 en la emulación y el viewport no limita el zoom.

WebKit en Linux con perfil móvil no reproduce por completo Safari en un iPhone físico. La confirmación final del comportamiento del teclado y zoom automático requiere los pasos anteriores en el dispositivo real. No se accede a los datos del alojamiento durante estas pruebas.
