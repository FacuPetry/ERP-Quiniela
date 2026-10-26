# Diagnóstico de un error de guardado en Cuenta corriente

## Caso revisado

Alta con cliente seleccionado por SF, comprobante de ingreso de apuesta, Numerador activo con serie 1 y próximo número 1, número sugerido 0001-00000001, fecha de origen y vencimiento iguales, importe 10 y Observacion NULL.

La reproducción aislada con el payload reportado (Cliente 00002, Comprobante ING) en MariaDB 11.8.9 respondió HTTP 201, conservó el vencimiento, guardó Importe 10.00 y Observacion NULL y avanzó el Numerador a 2. Se agrega un caso equivalente de integración para ambos motores.

Esto demuestra que esos datos son aceptados por el código y las migraciones del repositorio. **No identifica todavía la causa del fallo del alojamiento.** Sin su excepción no se atribuye el problema a una FK, fecha, numeración o NULL, ni se cambia la lógica financiera por suposición.

Observacion es nullable en el esquema. Los NULL de texto, fechas y relaciones opcionales se conservan. En los informes se pueden presentar valores mediante COALESCE según el significado del campo, sin sustituir una FK inexistente por 0 ni una fecha por un texto inválido.

## Por qué la respuesta anterior no identifica la causa

El cliente HTTP muestra un mensaje genérico para los errores 5xx. El manejador global devolvía únicamente `{"error":"No se pudo completar la solicitud."}` y no registraba la excepción original. Ese cuerpo no permite determinar qué consulta, restricción o condición del alojamiento falló.

## Registro incorporado

El manejador de errores de Cuenta corriente conserva las validaciones y conflictos 4xx existentes. Para un fallo inesperado o 5xx:

- Devuelve el estado HTTP y una `referencia` UUID en el JSON de respuesta.
- Emite en stderr una línea JSON con evento `cuenta_corriente.error`, la misma referencia, método, patrón de ruta, código del error, errno, SQLSTATE y ubicación relativa al módulo cuando están disponibles.
- No imprime el cuerpo recibido, cookies, contraseña, cadena de conexión, SQL con valores, mensaje SQL completo ni stack completo.
- No cambia inserciones, bloqueos, transacciones, reintentos, relaciones o esquema.

## Cómo obtener el error en Hostinger

1. Desplegar el commit que incorpora este diagnóstico desde la rama del PR. No hay migraciones ni variables nuevas.
2. Reintentar una vez el guardado desde la pantalla. Si falla, en Network/Red abrir el POST `/api/cuenta-corriente` y copiar el estado HTTP y el JSON de respuesta. No copiar encabezados con cookies o credenciales.
3. En los registros de **ejecución de Node.js** de la aplicación, buscar la línea `cuenta_corriente.error` con la referencia recibida. No confundir estos registros con los de compilación o instalación de npm. Si el panel no los ofrece, solicitar a Hostinger cómo consultar el stderr del proceso Node.js de esa aplicación.
4. Compartir esa línea de diagnóstico. Su código y ubicación permiten revisar el punto concreto; por ejemplo, distinguir un campo inexistente, una restricción, una conexión o un bloqueo. Los ejemplos de causas no constituyen un diagnóstico del caso reportado.

Si no aparece `referencia` en el nuevo cuerpo de error, primero comprobar en Hostinger qué commit y rama se desplegaron y si el backend fue reconstruido y reiniciado. Si aparece la referencia pero no los registros, conservarla junto con la hora del intento para localizar la ejecución correspondiente.

Las pruebas locales no acceden al alojamiento ni modifican sus movimientos.
