# Modelo de datos de referencia

Se conserva el diseño de 21 tablas acordado. La definición ejecutable está en `apps/api/src/database/schema.ts` y su historial en `database/migrations`. No hay datos de negocio precargados.

| Tabla | Finalidad y referencias |
|---|---|
| COMPROBANTE | Maestro de configuración, no cabecera de una operación |
| NUMERACION | Próximo número completo por Comprobante; configuración opcional y única |
| CLIENTETIPO | Clasificación comercial |
| CLIENTE | Cuenta comercial de un ClienteTipo |
| CONCEPTO | Motivos de ingresos, egresos y ajustes |
| CAJA | Caja física |
| CAJASALDO | Apertura y cierre de una Caja |
| CAJAMOVIMIENTO | Operación completa; Comprobante, número completo propio, Cliente, CajaSaldo y Concepto |
| CUENTACORRIENTE | Deuda o crédito; Cliente, Comprobante y CajaMovimiento cuando es generado |
| CAJAMOVIMIENTOAFECTACION | CajaMovimiento, CuentaCorriente e Importe |
| BANCO | Entidad financiera |
| BANCOCUENTA | Cuenta financiera propia de un Banco, incluida una billetera |
| CHEQUE | Identidad persistente del instrumento |
| CHEQUEEVENTO | Historia y participación en CajaMovimiento |
| TRANSFERENCIA | Transferencia concreta con FK directa a CajaMovimiento |
| BANCOMOVIMIENTO | Efecto bancario de Transferencia o ChequeEvento |
| ROL | Perfil de acceso |
| USUARIO | Usuario con un Rol |
| SESION | Sesión de un Usuario |
| AUDITORIA | Acciones y responsables |
| SOLICITUD | Claves para controlar reintentos |

```mermaid
erDiagram
    COMPROBANTE ||--o| NUMERACION : configura
    COMPROBANTE ||--o{ CAJAMOVIMIENTO : identifica
    COMPROBANTE ||--o{ CUENTACORRIENTE : identifica
    CLIENTETIPO ||--o{ CLIENTE : clasifica
    CLIENTE ||--o{ CUENTACORRIENTE : tiene
    CLIENTE |o--o{ CAJAMOVIMIENTO : participa
    CAJA ||--o{ CAJASALDO : abre
    CAJASALDO |o--o{ CAJAMOVIMIENTO : agrupa_efectivo
    CAJAMOVIMIENTO |o--o| CUENTACORRIENTE : genera
    CAJAMOVIMIENTO ||--o{ CAJAMOVIMIENTOAFECTACION : aplica
    CUENTACORRIENTE ||--o{ CAJAMOVIMIENTOAFECTACION : recibe
    CAJAMOVIMIENTO ||--o{ TRANSFERENCIA : incluye
    CAJAMOVIMIENTO |o--o{ CHEQUEEVENTO : utiliza
    CHEQUE ||--o{ CHEQUEEVENTO : conserva_historia
    BANCO ||--o{ BANCOCUENTA : identifica
    BANCOCUENTA ||--o{ TRANSFERENCIA : recibe_o_envia
    BANCOCUENTA ||--o{ BANCOMOVIMIENTO : registra
    TRANSFERENCIA |o--o| BANCOMOVIMIENTO : genera
    CHEQUEEVENTO |o--o| BANCOMOVIMIENTO : genera
```

El diagrama resume el circuito; las FK de usuarios y demás referencias se encuentran en el esquema. Las FK de CAJAMOVIMIENTOAFECTACION llevan nombres cortos porque MySQL limita los identificadores a 64 caracteres; no cambian los nombres de tablas o campos.

Importes de cheques y transferencias se obtienen desde sus participaciones y registros, no son columnas editables en la cabecera. Una operación puede contener varias transferencias con la misma FK CajaMovimiento. Reutilizar un cheque agrega un evento, no otro cheque.

Los premios se registran como deuda en PAGAR y se cancelan mediante pagos y afectaciones. Un jugador no necesita convertirse en proveedor. El saldo de cuenta corriente y el pendiente por comprobante no se descuentan dos veces.

## Decisiones funcionales aún pendientes

No se implementan en esta etapa ni se resuelven agregando tablas por anticipado:

- Aplicación de créditos independientes contra deudas.
- Redistribución de afectaciones confirmadas conservando la historia.
- Reversiones parciales, corrección de reversiones y operaciones bancarias conciliadas.
- Tratamiento contable del rechazo de cheques.
- Ajustes contables automáticos de diferencias de caja.
- Circuito de aperturas y ajustes bancarios independientes.

Los servicios de Cobros y pagos y los cierres básicos se incorporan en la etapa 6. Los circuitos indicados arriba continúan pendientes y no se ejecutan automáticamente.

## Número de comprobante

NUMERACION.ProximoNumero y los campos NumeroComprobante de CUENTACORRIENTE y CAJAMOVIMIENTO almacenan el BIGINT compuesto. No hay FK de movimientos al Numerador ni Serie separada. La migración conserva los números anteriores y sus registros, y exige resolver incompatibilidades antes de convertirlos. Ver [reglas y procedimiento](numeracion-comprobantes.md).


## Ampliación de Caja movimiento (etapa 6)

La migración 0003 incorpora ImporteACuenta inicial y CajaMovimientoOrigen en CAJAMOVIMIENTO, CuentaLibradora en CHEQUE, y fecha/usuario en CAJAMOVIMIENTOAFECTACION. No crea tablas. La reversión conserva la operación y el cierre originales, genera una contradeuda y mantiene el vínculo único. Ver [comportamiento y migración](etapa-6.md). Las aplicaciones posteriores de créditos y el tratamiento de rechazos permanecen pendientes.


## Tesorería de efectivo (etapa 7)

Reutiliza CAJAMOVIMIENTO sin cliente ni asiento de CUENTACORRIENTE, con ImporteTotal=ImporteEfectivo e ImporteACuenta=0. Aperturas y saldos físicos incluyen los movimientos confirmados de ambos módulos; los listados/detalles/correcciones separan los registros comerciales de los internos por sus relaciones persistidas, sin depender del maestro actual. No agrega columnas o tablas. Concepto es obligatorio. Las correcciones internas no generan deudas/créditos de cliente. Ver [alcance y pruebas](etapa-7.md).
