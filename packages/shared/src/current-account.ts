export interface CurrentAccountRecord {
  IDTabla: string;
  Cliente: string;
  ClienteNombre: string;
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
  comprobantes: {
    Codigo: string;
    Descripcion: string;
    Cuenta: string;
    Naturaleza: string;
  }[];
  numeradores: { Comprobante: string; ProximoNumero: string }[];
}
export interface CurrentAccountInput {
  Cliente: string;
  Comprobante: string;
  NumeroComprobante: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Importe: string;
  Observacion: string | null;
}
