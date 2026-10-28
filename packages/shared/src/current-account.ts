import type { NumberingOption } from "./voucher-number.js";
export interface CurrentAccountRecord {
  IDTabla: string;
  Cliente: string;
  ClienteNombre: string;
  Concepto: string | null;
  ConceptoDescripcion: string | null;
  Comprobante: string;
  ComprobanteDescripcion: string;
  CajaMovimiento: string | null;
  NumeroComprobante: string | null;
  NumeroComprobanteTexto: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Cuenta: string;
  Naturaleza: string;
  Importe: string;
  Estado: string;
  Observacion: string | null;
  CreadoEn?: string;
  MotivoAnulacion?: string | null;
  AnuladoEn?: string | null;
}
export interface CurrentAccountDetail {
  registro: CurrentAccountRecord;
  version: string;
}
export interface CurrentAccountList {
  registros: CurrentAccountRecord[];
  total: number;
  pagina: number;
  limite: number;
  saldos: { Cobrar: string; Pagar: string } | null;
}
export interface CurrentAccountOptions {
  conceptos: { Codigo: string; Descripcion: string }[];
  comprobantes: {
    Codigo: string;
    Descripcion: string;
    Cuenta: string;
    Naturaleza: string;
  }[];
  numeradores: NumberingOption[];
}
export interface CurrentAccountInput {
  NumeroAutomatico?: boolean | undefined;
  /** Opcional para conservar compatibilidad con clientes anteriores. */
  Concepto?: string | null;
  Cliente: string;
  Comprobante: string;
  NumeroComprobante: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Importe: string;
  Observacion: string | null;
}
