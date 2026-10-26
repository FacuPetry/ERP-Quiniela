# Numeración de comprobantes

Esta revisión reemplaza la selección de series por un Numerador interno y opcional. Requiere la migración `0002_numero_comprobante_completo`; desplegar solamente el código no actualiza la base. La tabla conserva su nombre físico NUMERACION y el ABM se llama Numerador.

## Representación y almacenamiento

El componente reutilizable NumeroComprobante tiene dos inputs unidos: punto de venta de cuatro dígitos y correlativo de ocho. Ambos comienzan en ceros, son editables por separado y completan ceros al salir. También se puede pegar un número completo. No se guarda el guion.

| Valor visible | BIGINT almacenado |
|---|---|
| 0001-00000025 | 100000025 |
| 0002-00000150 | 200000150 |
| 0012-00000001 | 1200000001 |
| 0000-00000001 | 1 |

La fórmula es `punto * 100000000 + correlativo`. Para recuperar las partes se utilizan división entera y resto, completando cuatro y ocho dígitos. Límite: punto 0 a 9999; correlativo 1 a 99999999; máximo completo 999999999999. Cero es un estado inicial del control, no un comprobante válido para guardar. No hay ambigüedad ni pérdida de posición de los ocho últimos dígitos. API y frontend transportan el BIGINT como texto decimal y calculan con BigInt.

La búsqueda de Cuenta corriente permite el formato completo o el número decimal almacenado. Cada comprobante tiene su propio espacio de números. Un número anulado sigue ocupado.

## Numerador y emisión

Numerador permite configurar Comprobante, Próximo número completo y Activo. Hay una configuración por comprobante, incluso si está inactiva. No hay campo Serie separado. Guardar la configuración no consume números.

Al elegir el comprobante en Cuenta corriente, el servidor consulta la configuración activa y propone el número. No se muestra un selector de Numerador ni se envía su ID. Si no existe uno activo, ambas partes comienzan en cero y se completan manualmente. La sugerencia no reserva números.

Al confirmar, una transacción verifica duplicados, guarda el movimiento, actualiza la configuración cuando corresponde y registra auditoría e idempotencia:

- Con el mismo punto configurado, el próximo número queda como mínimo por encima del mayor utilizado en ese punto, incluidos anulados. Un número libre menor puede guardarse sin retroceder la configuración.
- Si el usuario cambia el punto, es una emisión manual y no altera el próximo número del punto original.
- Dos guardados concurrentes del mismo comprobante y número no se confirman ambos: uno recibe conflicto. No se cambia silenciosamente el número que el usuario decidió guardar.
- Al utilizar el correlativo 99999999 del punto configurado, el Numerador conserva ese valor y queda inactivo. Nunca se salta al siguiente punto automáticamente.
- Un Numerador activo no puede configurarse con un próximo número menor o igual al máximo ya usado en ese punto. Uno inactivo puede conservar el valor agotado. Para reactivarlo deberá configurarse otro número válido.

La configuración y emisión usan un bloqueo por base, código canónico del comprobante y punto, además de bloqueos de fila. Los índices únicos protegen comprobante y número en cada tabla. Las futuras escrituras de Cobros y pagos deberán utilizar el mismo protocolo para controlar números entre ambas tablas. No se utiliza SELECT MAX sin serializar las escrituras.

## Cambios de base de datos

Se conservan las 21 tablas. No hay una tabla NUMERADOR nueva.

| Tabla | Cambio |
|---|---|
| NUMERACION | Se convierte ProximoNumero a BIGINT sin signo completo; se elimina Serie; unicidad por Comprobante |
| CUENTACORRIENTE | Se agrega NumeroComprobante BIGINT sin signo y se copian los números anteriores; se eliminan Numeracion y Numero y la FK al Numerador |
| CAJAMOVIMIENTO | La misma conversión a NumeroComprobante, sin FK al Numerador, para que el esquema del próximo módulo use el mismo criterio |

Las claves únicas quedan por Comprobante y NumeroComprobante. Los CHECK comprueban el rango y el correlativo positivo. CUENTACORRIENTE permite NULL para conservar movimientos históricos que no tenían número: se muestran como «Sin número». Las altas nuevas exigen un número válido. CAJAMOVIMIENTO conserva su obligatoriedad. Observaciones y otras relaciones o fechas opcionales mantienen sus NULL existentes.

La migración copia antes de retirar columnas. Usa la Serie anterior del Numerador o punto 0000 para números manuales. Conserva IDTabla, comprobante, importes, estados, anulaciones, afectaciones, auditorías y vínculos restantes. No cambia números de cheques ni cuentas bancarias. Los movimientos dejan de depender del Numerador, por lo que modificarlo o eliminarlo no reinterpreta la historia.

## Actualizar una base existente en Hostinger

Aplica tanto a producción como a la vista previa del PR. El dominio de vista previa puede cambiar y no garantiza una base separada.

1. En hPanel, abrir la aplicación que se quiere probar y comprobar la rama/commit desplegados. Revisar, sin compartir contraseñas, qué DB_HOST y DB_NAME utiliza. Confirmar si esa base también es utilizada por otra aplicación o por producción. Esta tarea no inspeccionó ni migró la base de Hostinger.
2. Detener temporalmente las aplicaciones que escriben en esa misma base. No probar altas ni modificar Numerador mientras se convierte la estructura. Coordinar con Hostinger si no hay una opción clara para detenerlas; la migración no reemplaza este mantenimiento.
3. Desde phpMyAdmin, seleccionar esa base, usar Exportar y obtener una copia SQL completa de estructura y datos; verificar que se descargó y conservarla fuera del repositorio. También puede utilizarse el mecanismo de respaldos del proveedor. Mantener disponible el código anterior si fuese necesario restaurar.
4. Publicar la revisión del PR manteniendo las escrituras detenidas. En SSH entrar a la carpeta real del despliegue donde está el package.json raíz de erp-quiniela. La carpeta o versión de Hostinger puede cambiar en cada publicación: no usar una ruta antigua sin comprobarla. Si npm no se encuentra, en este alojamiento ya se verificó Node 24 en `/opt/alt/alt-nodejs24/root/usr/bin`:

   ```bash
   export PATH="/opt/alt/alt-nodejs24/root/usr/bin:$PATH"
   node --version
   npm pkg get name
   ```

5. Los comandos SSH necesitan las mismas variables DB que el proceso web. Las variables de hPanel no necesariamente se heredan en la sesión SSH; usar el procedimiento privado de configuración que ya permitió ejecutar db:check:prod. No imprimir ni compartir contraseñas. Comprobar que los archivos compilados de esta revisión existen; no ejecutar contra una copia antigua de last-source.
6. Ejecutar primero la inspección de solo lectura:

   ```bash
   npm run db:numbering:check:prod
   ```

   Si informa incompatibilidades, detenerse y no ejecutar SQL manualmente. Casos que bloquean: más de un Numerador por comprobante, series no numéricas o de más de cuatro dígitos, correlativos antiguos fuera del rango, referencias inconsistentes, números que quedarían duplicados o una migración parcial. El programa informa cantidades y no elimina, fusiona ni renumera registros automáticamente. Con la versión anterior compatible y un respaldo, revisar cada caso antes de decidir qué configuración conservar; si hay movimientos referenciados, resolver la conservación de su historia explícitamente.
7. Si es compatible y existe respaldo, aplicar y verificar:

   ```bash
   npm run db:migrate:prod
   npm run db:check:prod
   ```

   Debe verificar la estructura de numeración actual además de las 21 tablas. db:migrate vuelve a ejecutar el preflight antes de cualquier DDL y no repite una migración ya registrada. No importar el archivo SQL directamente desde phpMyAdmin: se omitirían estas comprobaciones y el historial de migraciones.
8. Reiniciar la aplicación, habilitar las escrituras y recargar la vista previa para obtener el frontend actualizado. Probar el recorrido siguiente antes de aprobar el PR. No volver a ejecutar admin:create ni recrear tablas o usuarios.

MySQL/MariaDB no revierten de forma atómica toda una migración DDL. Si falla una vez iniciados los cambios de estructura, mantener la aplicación detenida y revisar el estado o restaurar el respaldo; no reintentar ciegamente. Un rollback solamente del código no revierte la base y la versión anterior no es compatible con las columnas nuevas. Si una misma base atiende más de un despliegue, todos deben quedar en la versión compatible.

Para desarrollo local, los equivalentes son `npm run db:numbering:check`, `npm run db:migrate` y `npm run db:check` con las variables de esa base. No apuntar las pruebas automáticas a la base real del negocio.

## Prueba completa antes de aprobar el PR

1. En Numerador configurar un comprobante de Cuenta corriente con Próximo número `0001-00000025`. No deben aparecer Serie ni Identificador. Un segundo Numerador para ese mismo comprobante debe rechazarse.
2. En Cuenta corriente agregar un movimiento, elegir primero el comprobante y seleccionar cliente por SF. Debe aparecer `0001-00000025` sin selector de Numerador. Probar Tab entre las partes y pegar un número completo.
3. Guardar importe 10, fecha de origen y vencimiento iguales y Observaciones vacío. Consultar: el número visible permanece completo; el valor guardado es 100000025. El siguiente alta propone `0001-00000026`.
4. Confirmar un correlativo mayor libre del mismo punto: la sugerencia avanza. Confirmar uno menor libre no debe retrocederla. Intentar duplicarlo, también después de anularlo, debe rechazarse.
5. Cambiar a otro punto al ingresar un movimiento: se conserva lo ingresado y el Numerador original no cambia. Un comprobante sin Numerador permite ingresar ambas partes manualmente.
6. Modificar o eliminar el Numerador y consultar movimientos anteriores: conservan sus números. Consultar/buscar tanto `0001-00000025` como `100000025`.
7. Revisar anulaciones, permisos y carga manual de la grilla; el cálculo de saldos continúa en la API, sin tarjetas en el listado. No es necesario refrescar toda la página después de guardar.

Si reaparece el error de guardado, copiar el estado HTTP, la respuesta y su referencia técnica; buscar esa referencia en el registro de ejecución de Node.js. Ver [diagnóstico](diagnostico-guardado-cuenta-corriente.md). Las pruebas aisladas de esta revisión no establecen la causa del fallo original de la vista previa.
