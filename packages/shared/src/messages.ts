/** Vista previa de solo lectura. Preparar/copiar no constituye un envío. */
export interface BalanceMessagePreview {
  Cliente: string;
  ClienteNombre: string;
  FechaHasta: string;
  SaldoTotal: string;
  Situacion: "PENDIENTE_PAGO" | "A_FAVOR" | "SIN_SALDO";
  Mensaje: string;
  consultadoEn: string;
}
