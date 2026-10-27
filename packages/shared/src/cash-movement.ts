export interface Allocation {
  CuentaCorriente: string;
  Importe: string;
}
export type CashValue =
  | {
      Tipo: "TRANSFERENCIA";
      BancoCuenta: string;
      Importe: string;
      Referencia: string | null;
    }
  | {
      Tipo: "PROPIO" | "TERCERO";
      Banco: string;
      BancoCuenta: string | null;
      CuentaLibradora: string | null;
      Numero: string;
      Librador: string | null;
      Documento: string | null;
      Emision: string;
      Vencimiento: string;
      Importe: string;
    }
  | { Tipo: "CARTERA"; Cheque: string };
export interface CashInput {
  Comprobante: string;
  NumeroComprobante: string;
  Cliente: string;
  FechaOrigen: string;
  CajaSaldo: string;
  Concepto: string | null;
  ImporteEfectivo: string;
  ImporteACuenta: string;
  Observacion: string | null;
  Afectaciones: Allocation[];
  Valores: CashValue[];
}
export interface CashRecord {
  Cuenta: string;
  DisponibleACuenta: string;
  IDTabla: string;
  Comprobante: string;
  ComprobanteDescripcion: string;
  NumeroComprobante: string;
  NumeroComprobanteTexto: string;
  Cliente: string;
  ClienteNombre: string;
  FechaOrigen: string;
  CajaSaldo: string;
  CajaNombre: string;
  Concepto: string | null;
  ConceptoDescripcion: string | null;
  Sentido: string;
  ImporteEfectivo: string;
  ImporteACuenta: string;
  ImporteTotal: string;
  Observacion: string | null;
  Estado: string;
  RevertidoPor: string | null;
  CajaMovimientoOrigen: string | null;
  MotivoAnulacion: string | null;
  CreadoEn: string;
}
export interface ValueDetail {
  Tipo: string;
  IDTabla: string;
  Numero: string;
  Banco: string;
  BancoNombre: string;
  BancoCuenta: string | null;
  CuentaNombre: string | null;
  Importe: string;
  Estado: string;
  CuentaLibradora?: string | null;
  Emision?: string;
  Vencimiento?: string;
}
export interface AllocationDetail extends Allocation {
  NumeroComprobanteTexto: string;
  ComprobanteDescripcion: string;
  ImporteOriginal: string;
  Pendiente: string;
  FechaOrigen: string;
}
export interface CashDetail {
  registro: CashRecord;
  version: string;
  valores: ValueDetail[];
  afectaciones: AllocationDetail[];
}
export interface CashList {
  registros: CashRecord[];
  total: number;
  pagina: number;
  limite: number;
}
export interface PendingMovement {
  IDTabla: string;
  ComprobanteDescripcion: string;
  NumeroComprobanteTexto: string;
  FechaOrigen: string;
  Vencimiento: string | null;
  Importe: string;
  Pendiente: string;
}
export interface PendingList {
  registros: PendingMovement[];
  total: number;
  pagina: number;
  limite: number;
}
export interface CashOpening {
  IDTabla: string;
  Caja: string;
  CajaNombre: string;
  AperturaEn: string;
  SaldoInicial: string;
  Estado: string;
  SaldoActual: string;
  SaldoContado: string | null;
  Diferencia: string | null;
}
export interface CashOptions {
  comprobantes: {
    Codigo: string;
    Descripcion: string;
    Cuenta: string;
    Naturaleza: string;
    SentidoFondos: string;
  }[];
  numeradores: { Comprobante: string; ProximoNumero: string }[];
  cajas: { Codigo: string; Nombre: string }[];
  aperturas: CashOpening[];
  cuentas: { Codigo: string; Nombre: string; Banco: string }[];
  bancos: { Codigo: string; Nombre: string }[];
  conceptos: { Codigo: string; Descripcion: string }[];
}
export function moneyUnits(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value))
    throw new Error("Importe inválido.");
  const [a, b = ""] = value.split(".");
  return BigInt(a!) * 100n + BigInt(b.padEnd(2, "0"));
}
export function moneyText(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return (
    sign + (a / 100n).toString() + "." + (a % 100n).toString().padStart(2, "0")
  );
}
