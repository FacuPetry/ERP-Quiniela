export const valueTypes = [
  { value: "PROPIO", label: "Cheque propio" },
  { value: "TERCERO", label: "Cheque de terceros" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
] as const;
export const valueStates = [
  { value: "CARTERA", label: "En cartera" },
  { value: "EMITIDO", label: "Emitido" },
  { value: "ENDOSADO", label: "Endosado" },
  { value: "DEVUELTO", label: "Devuelto" },
  { value: "RECEPCION_ANULADA", label: "Recepción anulada" },
  { value: "ANULADO", label: "Anulado" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "REVERTIDO", label: "Revertido" },
] as const;
export type ValueFamily = "CHEQUE" | "TRANSFERENCIA";
export interface ValueRecord {
  Clave: string;
  IDTabla: string;
  Familia: ValueFamily;
  Tipo: string;
  Numero: string;
  Fecha: string;
  Vencimiento: string | null;
  Importe: string;
  Estado: string;
  Banco: string;
  BancoNombre: string;
  BancoCuenta: string | null;
  CuentaNombre: string | null;
  ClienteNombre: string | null;
  ComprobanteDescripcion: string;
  NumeroComprobanteTexto: string | null;
  OrigenCajaMovimiento: string | null;
  CreadoEn: string;
  UsuarioNombre: string;
}
export interface ValueOperation {
  IDTabla: string;
  Modulo: "COBROSPAGOS" | "TESORERIA";
  ComprobanteDescripcion: string;
  NumeroComprobanteTexto: string;
  FechaOrigen: string;
  ClienteNombre: string | null;
  CajaNombre: string | null;
  Estado: string;
  CajaMovimientoOrigen: string | null;
  CreadoEn: string;
  UsuarioNombre: string;
  AnuladoEn: string | null;
  AnuladoPor: string | null;
  MotivoAnulacion: string | null;
  Observacion: string | null;
}
export interface ValueEvent {
  Clave: string;
  Tipo: string;
  Fecha: string;
  RegistradoEn: string;
  UsuarioNombre: string;
  CuentaNombre: string | null;
  Observacion: string | null;
  CajaMovimiento: string | null;
  Operacion: string | null;
  EstadoOperacion: string | null;
}
export interface ValueRecordDetail {
  registro: ValueRecord;
  datos: {
    CuentaLibradora: string | null;
    Librador: string | null;
    Documento: string | null;
    Observacion: string | null;
  };
  historial: ValueEvent[];
  operaciones: ValueOperation[];
}
export interface ValueList {
  registros: ValueRecord[];
  total: number;
  pagina: number;
  limite: number;
}
export const valueTypeLabel = (value: string) =>
  valueTypes.find((v) => v.value === value)?.label ?? value;
export const valueStateLabel = (value: string) =>
  valueStates.find((v) => v.value === value)?.label ?? value;
export function valueEventLabel(value: string) {
  const labels: Record<string, string> = {
    RECEPCION: "Recepción",
    EMISION: "Emisión",
    ENDOSO: "Endoso",
    DEVOLUCION: "Devolución",
    ANULACION: "Anulación",
    RECUPERACION: "Recuperación",
    ANULACION_RECEPCION: "Anulación de recepción",
    REGISTRO: "Registro de transferencia",
    REGISTRO_REVERSION: "Registro de transferencia de reversión",
    REVERSION: "Reversión",
  };
  return labels[value] ?? value;
}
