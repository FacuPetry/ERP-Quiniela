/** Saldos actuales; no representa un corte histórico ni compensa las dos cuentas. */
export interface AccountSummaryRow {
  Cliente: string;
  ClienteNombre: string;
  SaldoCobrar: string;
  SaldoPagar: string;
  SaldoNeto: string;
  PendienteCobrar: string;
  PendientePagar: string;
  CreditoSinAplicarCobrar: string;
  CreditoSinAplicarPagar: string;
}
export interface AccountSummary {
  registros: AccountSummaryRow[];
  total: number;
  pagina: number;
  limite: number;
  consultadoEn: string;
  totales: { SaldoCobrar: string; SaldoPagar: string; SaldoNeto: string };
}

export interface AccountLedgerAllocation {
  CuentaCorriente: string;
  CajaMovimiento: string;
  Documento: string;
  Operacion: string;
  Fecha: string;
  Importe: string;
  Estado: string;
  Vigente: boolean;
}
export interface AccountLedgerValue {
  CajaMovimiento: string;
  Operacion: string;
  Tipo: string;
  Numero: string;
  BancoNombre: string;
  CuentaNombre: string | null;
  Importe: string;
  Estado: string;
}
export interface AccountLedgerRow {
  Clave: string;
  FechaOrigen: string;
  ComprobanteDescripcion: string;
  NumeroComprobanteTexto: string;
  Detalle: string;
  Cuenta: string;
  Naturaleza: string;
  Estado: string;
  EsReverso: boolean;
  Debito: string;
  Credito: string;
  SaldoAcumulado: string;
  SaldoCobrar: string;
  SaldoPagar: string;
  ImporteOriginal: string;
  Operacion: string | null;
  Original: string | null;
  Reversion: string | null;
  MotivoAnulacion: string | null;
  AnuladoEn: string | null;
  Afectaciones: AccountLedgerAllocation[];
  Valores: AccountLedgerValue[];
}
export interface AccountLedger {
  /** «A vencer» agrupa FechaOrigen > Hasta, no Vencimiento ni pendiente documental. */
  saldoAVencer: {
    Debito: string;
    Credito: string;
    Saldo: string;
    SaldoAcumulado: string;
  };
  /** Fechas de origen inclusivas. Anulados excluidos; efectos vigentes al consultar. */
  Desde: string | null;
  Hasta: string | null;
  saldoAnterior: {
    Debito: string;
    Credito: string;
    Saldo: string;
    SaldoCobrar: string;
    SaldoPagar: string;
  };
  registros: AccountLedgerRow[];
  total: number;
  pagina: number;
  limite: number;
  Cliente: string;
  ClienteNombre: string;
  consultadoEn: string;
  totales: {
    Debito: string;
    Credito: string;
    SaldoFinal: string;
    SaldoCobrar: string;
    SaldoPagar: string;
  };
}

/** Una fila por apertura real de caja, no por fecha ni comprobante. */
export interface DailyCashRow {
  Clave: string;
  Caja: string;
  CajaNombre: string;
  AperturaEn: string;
  CierreEn: string | null;
  Estado: "ABIERTO" | "CERRADO";
  UsuarioAperturaNombre: string;
  UsuarioCierreNombre: string | null;
  Observacion: string | null;
  SaldoInicial: string;
  IngresosEfectivo: string;
  EgresosEfectivo: string;
  IngresosComerciales: string;
  EgresosComerciales: string;
  IngresosTesoreria: string;
  EgresosTesoreria: string;
  IngresosOtrosMedios: string;
  EgresosOtrosMedios: string;
  Teorico: string | null;
  TeoricoCalculado: string;
  SaldoContado: string | null;
  Diferencia: string | null;
  CierreCoincide: boolean | null;
  Movimientos: number;
}
export interface DailyCashReport {
  registros: DailyCashRow[];
  total: number;
  pagina: number;
  limite: number;
  consultadoEn: string;
  totales: DailyCashTotals;
  subtotales: (DailyCashTotals & {
    Caja: string;
    CajaNombre: string;
    Jornadas: number;
  })[];
}

export interface DailyCashTotals {
  IngresosEfectivo: string;
  EgresosEfectivo: string;
  IngresosComerciales: string;
  EgresosComerciales: string;
  IngresosTesoreria: string;
  EgresosTesoreria: string;
  IngresosOtrosMedios: string;
  EgresosOtrosMedios: string;
  Diferencia: string | null;
  Movimientos: number;
  Abiertas: number;
  Cerradas: number;
}

/** Situación actual de instrumentos, no reconstrucción histórica ni saldo bancario. */
export interface ThirdPartyChequeRow {
  Clave: string;
  Numero: string;
  Emision: string;
  Vencimiento: string;
  Importe: string;
  Estado: string;
  Banco: string;
  BancoNombre: string;
  BancoCuenta: string | null;
  CuentaNombre: string | null;
  Cliente: string | null;
  ClienteNombre: string | null;
  Librador: string | null;
  CuentaLibradora: string | null;
  Operacion: string | null;
  Historial?: ThirdPartyChequeEvent[];
}
export interface ThirdPartyChequeEvent {
  Clave: string;
  Tipo: string;
  Fecha: string;
  UsuarioNombre: string;
  CuentaNombre: string | null;
  Operacion: string | null;
  EstadoOperacion: string | null;
  Observacion: string | null;
  SentidoBancario: string | null;
  ImporteBancario: string | null;
}
export interface ThirdPartyChequeReport {
  registros: ThirdPartyChequeRow[];
  total: number;
  pagina: number;
  limite: number;
  consultadoEn: string;
  totales: { Cantidad: number; Importe: string };
  subtotales: { Estado: string; Cantidad: number; Importe: string }[];
}
