export interface CurrentAccountRecord {
  IDTabla: string;
  Cliente: string;
  ClienteNombre: string;
  Comprobante: string;
  ComprobanteDescripcion: string;
  Numeracion: string | null;
  CajaMovimiento: string | null;
  Serie: string;
  Numero: string | null;
  NumeroComprobante: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Cuenta: string;
  Naturaleza: string;
  Importe: string;
  Estado: string;
  Observacion: string | null;
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
  numeraciones: {
    IDTabla: string;
    Comprobante: string;
    Serie: string;
    ProximoNumero: string;
  }[];
}
export interface CurrentAccountInput {
  Cliente: string;
  Comprobante: string;
  Numeracion: string | null;
  NumeroComprobante: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Importe: string;
  Observacion: string | null;
}
export function formatVoucherNumber(serie: string, numero: string): string {
  return `${serie.padStart(4, "0")}-${numero.padStart(8, "0")}`;
}
