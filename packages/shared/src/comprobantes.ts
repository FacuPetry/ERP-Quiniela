/** Catálogos compartidos por API e interfaz. Las columnas SQL siguen siendo VARCHAR. */
export enum ModuloComprobante {
  CuentaCorriente = "CUENTACORRIENTE",
  CobrosPagos = "COBROSPAGOS",
  Tesoreria = "TESORERIA",
  Valores = "VALORES",
}

export enum CuentaComprobante {
  Cobrar = "COBRAR",
  Pagar = "PAGAR",
  NoAplica = "NOAPLICA",
}

export enum NaturalezaComprobante {
  Deuda = "DEUDA",
  Credito = "CREDITO",
  NoAplica = "NOAPLICA",
}

export enum SentidoFondosComprobante {
  Ingreso = "INGRESO",
  Egreso = "EGRESO",
  NoAplica = "NOAPLICA",
}

export const modulosComprobante = [
  { value: ModuloComprobante.CuentaCorriente, label: "Cuenta corriente" },
  { value: ModuloComprobante.CobrosPagos, label: "Cobros y pagos" },
  { value: ModuloComprobante.Tesoreria, label: "Tesorería" },
  { value: ModuloComprobante.Valores, label: "Valores" },
] as const;
export const cuentasComprobante = [
  { value: CuentaComprobante.Cobrar, label: "Cobrar" },
  { value: CuentaComprobante.Pagar, label: "Pagar" },
  { value: CuentaComprobante.NoAplica, label: "No aplica" },
] as const;
export const naturalezasComprobante = [
  { value: NaturalezaComprobante.Deuda, label: "Deuda" },
  { value: NaturalezaComprobante.Credito, label: "Crédito" },
  { value: NaturalezaComprobante.NoAplica, label: "No aplica" },
] as const;
export const sentidosFondosComprobante = [
  { value: SentidoFondosComprobante.Ingreso, label: "Ingreso" },
  { value: SentidoFondosComprobante.Egreso, label: "Egreso" },
  { value: SentidoFondosComprobante.NoAplica, label: "No aplica" },
] as const;
