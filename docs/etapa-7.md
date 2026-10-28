# Etapa 7 — Tesorería: ingresos y retiros de efectivo

Primera entrega de Tesorería. Registra aportes y retiros de efectivo sobre una apertura de caja vigente. No registra traspasos entre cajas, caja–banco ni banco–caja, y no incorpora saldos bancarios o ajustes automáticos de diferencias de cierre.

## Funcionamiento

- Listado en `/tesoreria`, vacío al ingresar. Actualizar o aplicar filtros consulta los registros. Fechas iniciales de hoy y estado Confirmado; se pueden modificar o limpiar. Al guardar solo se refresca el listado si ya se había solicitado.
- Comprobante primero, número compuesto de cuatro y ocho dígitos, caja activa compartida, fecha de hoy sugerida, concepto obligatorio, importe positivo y observaciones opcionales. Identificar en observaciones quién entrega/recibe los fondos. El importe comienza en 0,00 y debe completarse con un valor mayor que cero.
- Datos generales e Importes utilizan FormSections, con navegación, resaltado y encabezados sticky existentes. Caja y Estado se muestran debajo del número, a la derecha. No hay Cliente, Afectaciones, Valores ni importes a cuenta.
- La caja seleccionada es la misma preferencia por usuario/sesión/pestaña utilizada por Cobros y pagos. El listado reutiliza el panel Administrar cajas para abrir, cerrar o seleccionar explícitamente una apertura. El maestro Cajas conserva exclusivamente sus datos maestros.
- ADMIN escribe. Los usuarios de consulta pueden filtrar, observar y consultar Propiedades, sin registrar ni corregir operaciones.
- Los confirmados se consultan, no se editan ni eliminan. Las correcciones se hacen mediante anulación o reversión.

## Configurar comprobantes

Los códigos son ejemplos libres. Todos pertenecen al módulo **Tesorería**, con Cuenta y Naturaleza **No aplica**, y deben estar activos para emitir nuevas operaciones.

| Uso | Sentido de fondos | Exclusivo para reversiones | Asociación |
|---|---|---|---|
| Ingreso de efectivo (ITES) | Ingreso | No | Reversión de ingreso |
| Retiro de efectivo (ETES) | Egreso | No | Reversión de retiro |
| Reversión de ingreso (RITES) | Egreso | Sí | Vacío |
| Reversión de retiro (RETES) | Ingreso | Sí | Vacío |

Crear primero los comprobantes exclusivos y asociarlos a los normales. Un Numerador es opcional para altas normales: sin él se ingresa un número válido manualmente. La reversión exige un Numerador activo para el comprobante asociado. No se puede elegir ni numerar manualmente una reversión desde una carga normal. Su comprobante y número permanecen como solo lectura; solo Motivo es editable.

La validación compartida de Comprobantes contempla Tesorería y conserva las reglas de Cobros y pagos: no admite asociaciones cruzadas entre módulos, cadenas, autorreferencias o sentido incompatible. No se configuran ni modifican comprobantes de negocio automáticamente.

## Efectivo y Cuenta corriente

El saldo físico sigue siendo SaldoInicial + ingresos confirmados de ImporteEfectivo − egresos confirmados de ImporteEfectivo de la apertura. Incluye tanto Tesorería como Cobros y pagos. Transferencias y cheques no se convierten en efectivo.

Ejemplo: apertura con 0; aporte de Tesorería 100.000; pago de premio en efectivo 60.000; retiro de Tesorería 10.000. Disponible: 30.000. El saldo inicial original permanece en 0. Solo el pago al cliente genera su asiento comercial y afectación; aporte/retiro no crean ni alteran deudas, créditos, anticipos, valores o movimientos bancarios.

Se reutiliza CAJAMOVIMIENTO con Cliente NULL, ImporteACuenta=0 e ImporteTotal=ImporteEfectivo. No se insertan filas en CUENTACORRIENTE, CAJAMOVIMIENTOAFECTACION, TRANSFERENCIA, CHEQUE, CHEQUEEVENTO ni BANCOMOVIMIENTO. No hay nuevas tablas, columnas, migraciones, dependencias ni variables de entorno. Se requiere tener aplicadas las migraciones anteriores del sistema.

Los servicios y consultas distinguen fondos internos por Cliente NULL y ausencia de asiento de CUENTACORRIENTE; no utilizan la configuración mutable de COMPROBANTE para reclasificar movimientos. Los registros comerciales permanecen en Cobros y pagos. Los registros preexistentes que ya cumplieran esa condición se conservan y se consultan como fondos internos; antes de corregir se verifica además que sean efectivo simple, sin valores, aplicaciones ni importes a cuenta.

## Correcciones y consistencia

- Anular: misma apertura seleccionada, aún abierta y activa. Invalida el movimiento sin alterar su número, registra motivo/usuario/instante y conserva la auditoría. Retirar el efecto de un aporte ya consumido se bloquea si dejaría efectivo negativo.
- Revertir: origen cerrado, destino abierto/activo seleccionado y comprobante de reversión compatible. Se registra un movimiento contrario con fecha actual y CajaMovimientoOrigen. El original muestra Revertido; el nuevo, Confirmado · Reversión. No modifica las cifras de un cierre anterior ni crea contradeudas de cliente.
- No se corrigen originales ya anulados/revertidos ni movimientos que son reversos. Sin apertura válida no se confirma la operación. La jornada se identifica por CAJASALDO.IDTabla, no por igualdad de fecha ni de caja física.
- El servidor valida apertura, comprobante, concepto, importe, saldo y dependencias bajo transacción/bloqueos. Los cobros/pagos y movimientos de Tesorería comparten el bloqueo de apertura para no consumir dos veces el efectivo disponible.
- Numeración y auditoría forman parte de la misma transacción. Un fallo no deja movimientos parciales ni consume números. Los reintentos idempotentes devuelven la misma operación. Las altas normales conservan el protocolo de numeración existente; las reversiones asignan desde su Numerador bloqueado.
- Las rutas de ambos módulos aplican su alcance también al detalle, anulación y reversión: no basta conocer el ID de un registro del otro módulo para corregirlo desde una ruta incorrecta.

## Arquitectura reutilizada

El servicio y router de movimientos reciben un módulo fijo desde el servidor, no desde parámetros del usuario. Comparten controles financieros, apertura, efectivo, numeración, auditoría y correcciones. El contrato estricto de `/api/tesoreria` solo admite Comprobante, NumeroComprobante, CajaSaldo, Concepto, FechaOrigen, Importe y Observacion; rechaza clientes, valores, afectaciones y totales arbitrarios.

El frontend comparte listado, filtros, selección de caja, Propiedades y diálogos de corrección; TreasuryForm compone los controles existentes para sus campos específicos. No se modifican estilos de la biblioteca. Los clientes HTTP distinguen las entradas de cada módulo mediante tipos y reutilizan el transporte común.

## Cómo probar

1. Publicar el código con el procedimiento habitual. Esta entrega no requiere ejecutar una migración nueva.
2. Crear los comprobantes y sus asociaciones según la tabla. Crear Numeradores activos para los exclusivos y, opcionalmente, los normales. Preparar al menos un concepto activo.
3. Entrar a Tesorería: no debe solicitar registros hasta Filtrar/Actualizar. Sin caja seleccionada no se habilita Agregar. Desde Administrar caja abrir con saldo 0 y usarla explícitamente.
4. Crear un ingreso de 100.000, concepto y observaciones. Comprobar número, fecha, formato del importe, caja y posterior consulta/Propiedades. No debe aparecer como cobro ni como movimiento de Cuenta corriente.
5. Desde Cobros y pagos pagar un premio de 60.000 en efectivo. El disponible será 40.000. Desde Tesorería retirar 10.000; queda 30.000. Intentar retirar 30.001: debe rechazarse sin consumir el número.
6. Anular el retiro desde su formulario o listado: debe volver a 40.000. Intentar anular el aporte consumido: se bloquea si dejaría saldo negativo. Consultar Anulados y su motivo.
7. Cerrar la apertura, abrir/seleccionar otra con efectivo suficiente y revertir el ingreso original. Comprobante y número automáticos, solo Motivo editable. Verificar estado, enlace bidireccional desde Propiedades y cierre anterior intacto. Revertir un retiro produce un ingreso en la apertura actual.
8. Probar Numerador de reversión ausente/inactivo, caja cerrada desde otra pestaña, concepto inactivo, filtros, ordenamiento y navegación en móvil. Las cargas normales conservan edición de comprobante y número.

La integración utiliza MySQL y MariaDB efímeros: valida separación comercial, flujo aporte→pago→retiro, anulación y reversión en ambos sentidos, cierre histórico, permisos, idempotencia, concurrencia, rollback tras fallo de auditoría y clasificación histórica independiente del maestro. La revisión de navegador con API simulada complementa esas pruebas; no sustituye pruebas físicas de caja o del entorno de Hostinger.

Traspasos entre cajas, movimientos bancarios, aplicación posterior de anticipos y el circuito completo de Valores continúan para entregas posteriores. No se simulan mediante cobros ficticios ni dos movimientos manuales sin vínculo.
