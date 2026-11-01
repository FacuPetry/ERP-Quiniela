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
