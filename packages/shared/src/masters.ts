import {
  modulosComprobante,
  cuentasComprobante,
  naturalezasComprobante,
  sentidosFondosComprobante,
} from "./comprobantes.js";

/** Descripción pública de los formularios y contratos de los maestros. */
export type MasterKey =
  | "tipos-cliente"
  | "clientes"
  | "conceptos"
  | "cajas"
  | "bancos"
  | "cuentas-bancarias"
  | "comprobantes"
  | "numeraciones";
export interface MasterField {
  name: string;
  label: string;
  maxLength: number;
  required?: boolean;
  kind?: "email" | "textarea" | "relation" | "select" | "integer";
  options?: readonly { value: string; label: string }[];
  minimum?: string;
  maximum?: string;
  defaultValue?: string;
  hint?: string;
  relation?: MasterKey;
  /** Texto de la entidad relacionada. Definirlo para toda relación mostrada en una grilla. */
  relationLabelField?: string;
}
export interface MasterDefinition {
  key: MasterKey;
  title: string;
  singular: string;
  feminine?: boolean;
  automaticCode?: boolean;
  /** Los maestros con IDTabla conservan su PK autoincremental, sin inventar Codigo. */
  primaryKey?: "Codigo" | "IDTabla";
  description: string;
  fields: readonly MasterField[];
  columns: readonly string[];
}

const codigo: MasterField = {
  name: "Codigo",
  label: "Código",
  required: true,
  maxLength: 20,
};
const descripcion: MasterField = {
  name: "Descripcion",
  label: "Descripción",
  required: true,
  maxLength: 100,
};
const nombre: MasterField = {
  name: "Nombre",
  label: "Nombre",
  required: true,
  maxLength: 100,
};

export const masterDefinitions: Record<MasterKey, MasterDefinition> = {
  comprobantes: {
    key: "comprobantes",
    title: "Comprobantes",
    singular: "comprobante",
    description: "Configurá los comprobantes reutilizables del sistema.",
    fields: [
      codigo,
      descripcion,
      {
        name: "ModuloOrigen",
        label: "Módulo de origen",
        required: true,
        maxLength: 30,
        kind: "select",
        options: modulosComprobante,
      },
      {
        name: "Cuenta",
        label: "Cuenta",
        required: true,
        maxLength: 10,
        kind: "select",
        options: cuentasComprobante,
      },
      {
        name: "Naturaleza",
        label: "Naturaleza",
        required: true,
        maxLength: 10,
        kind: "select",
        options: naturalezasComprobante,
        hint: "Deuda aumenta lo pendiente; Crédito lo reduce en la cuenta elegida.",
      },
      {
        name: "SentidoFondos",
        label: "Sentido de fondos",
        required: true,
        maxLength: 20,
        kind: "select",
        options: sentidosFondosComprobante,
      },
      {
        name: "Orden",
        label: "Orden",
        maxLength: 11,
        kind: "integer",
        minimum: "-2147483648",
        maximum: "2147483647",
      },
    ],
    columns: [
      "Codigo",
      "Descripcion",
      "ModuloOrigen",
      "Cuenta",
      "Naturaleza",
      "SentidoFondos",
      "Orden",
    ],
  },
  numeraciones: {
    key: "numeraciones",
    title: "Numerador",
    singular: "numeración",
    feminine: true,
    primaryKey: "IDTabla",
    description:
      "Administrá las series y el próximo número de cada comprobante.",
    fields: [
      {
        name: "IDTabla",
        label: "Identificador",
        required: true,
        kind: "integer",
        maxLength: 19,
        minimum: "1",
        maximum: "9223372036854775807",
      },
      {
        name: "Comprobante",
        label: "Comprobante",
        required: true,
        maxLength: 20,
        kind: "relation",
        relation: "comprobantes",
        relationLabelField: "Descripcion",
      },
      { name: "Serie", label: "Serie", required: true, maxLength: 10 },
      {
        name: "ProximoNumero",
        label: "Próximo número",
        required: true,
        maxLength: 19,
        kind: "integer",
        minimum: "1",
        maximum: "9223372036854775807",
        defaultValue: "1",
        hint: "Guardar la configuración no consume números. Debe superar los números ya utilizados.",
      },
    ],
    columns: ["Comprobante", "Serie", "ProximoNumero"],
  },
  "tipos-cliente": {
    key: "tipos-cliente",
    title: "Tipos de cliente",
    singular: "tipo de cliente",
    description: "Clasificá las cuentas comerciales de tus clientes.",
    fields: [codigo, descripcion],
    columns: ["Codigo", "Descripcion"],
  },
  clientes: {
    key: "clientes",
    title: "Clientes",
    singular: "cliente",
    automaticCode: true,
    description: "Consultá y administrá los datos de tus clientes.",
    fields: [
      codigo,
      {
        name: "ClienteTipo",
        label: "Tipo de cliente",
        required: true,
        maxLength: 20,
        kind: "relation",
        relation: "tipos-cliente",
        relationLabelField: "Descripcion",
      },
      { ...nombre, maxLength: 150 },
      { name: "Fantasia", label: "Nombre de fantasía", maxLength: 150 },
      { name: "DocumentoTipo", label: "Tipo de documento", maxLength: 10 },
      { name: "Documento", label: "Documento", maxLength: 20 },
      { name: "Telefono", label: "Teléfono", maxLength: 40 },
      {
        name: "Email",
        label: "Correo electrónico",
        maxLength: 150,
        kind: "email",
      },
      { name: "Domicilio", label: "Domicilio", maxLength: 250 },
      {
        name: "Observacion",
        label: "Observaciones",
        maxLength: 4000,
        kind: "textarea",
      },
    ],
    columns: ["Codigo", "Nombre", "ClienteTipo", "Documento", "Telefono"],
  },
  conceptos: {
    key: "conceptos",
    title: "Conceptos",
    singular: "concepto",
    description: "Definí los motivos de ingresos, egresos y ajustes.",
    fields: [codigo, descripcion],
    columns: ["Codigo", "Descripcion"],
  },
  cajas: {
    key: "cajas",
    title: "Cajas",
    singular: "caja",
    feminine: true,
    description:
      "Administrá las cajas del negocio. Sus aperturas y cierres se incorporarán en Tesorería.",
    fields: [codigo, nombre],
    columns: ["Codigo", "Nombre"],
  },
  bancos: {
    key: "bancos",
    title: "Bancos",
    singular: "banco",
    description:
      "Administrá las entidades financieras utilizadas por el sistema.",
    fields: [codigo, nombre],
    columns: ["Codigo", "Nombre"],
  },
  "cuentas-bancarias": {
    key: "cuentas-bancarias",
    title: "Cuentas bancarias",
    singular: "cuenta bancaria",
    feminine: true,
    description:
      "Registrá cuentas propias y billeteras asociadas a una entidad financiera.",
    fields: [
      codigo,
      {
        name: "Banco",
        label: "Banco",
        required: true,
        maxLength: 20,
        kind: "relation",
        relation: "bancos",
        relationLabelField: "Nombre",
      },
      nombre,
      { name: "Titular", label: "Titular", required: true, maxLength: 150 },
      { name: "Numero", label: "Número de cuenta", maxLength: 50 },
      { name: "CBU", label: "CBU / CVU", maxLength: 22 },
      { name: "Alias", label: "Alias", maxLength: 100 },
    ],
    columns: ["Codigo", "Nombre", "Banco", "Titular", "Alias"],
  },
};

export interface MasterRecord {
  Activo: boolean;
  [field: string]: string | boolean | null;
}

export function masterRecordKey(
  master: MasterDefinition,
  record: MasterRecord,
): string {
  return String(record[master.primaryKey ?? "Codigo"]);
}

/** IDTabla permanece en el contrato y la persistencia, nunca en la presentación del ABM. */
export function masterFormFields(
  master: MasterDefinition,
): readonly MasterField[] {
  return master.fields.filter((field) => field.name !== "IDTabla");
}

export function masterListColumns(master: MasterDefinition): readonly string[] {
  return master.columns.filter((name) => name !== "IDTabla");
}

export function masterRecordLabel(
  master: MasterDefinition,
  record: MasterRecord,
  descriptions?: MasterList["descripciones"],
): string {
  if (master.primaryKey !== "IDTabla") return masterRecordKey(master, record);
  const values = masterListColumns(master)
    .slice(0, 2)
    .map((name) => {
      const value = String(record[name] ?? "");
      return descriptions?.[name]?.[value] ?? value;
    })
    .filter(Boolean);
  return values.join(" · ") || master.singular;
}

/** Valida enteros como texto, sin redondear BIGINT mediante Number. */
export function integerFieldError(
  field: MasterField,
  value: string,
): string | undefined {
  if (!value && !field.required) return undefined;
  if (!/^-?[0-9]+$/.test(value)) return "Ingresá un número entero.";
  const number = BigInt(value);
  if (field.minimum !== undefined && number < BigInt(field.minimum))
    return `El valor mínimo es ${field.minimum}.`;
  if (field.maximum !== undefined && number > BigInt(field.maximum))
    return `El valor máximo es ${field.maximum}.`;
  return undefined;
}
export interface MasterList {
  registros: MasterRecord[];
  total: number;
  pagina: number;
  limite: number;
  /** Campo de referencia → código relacionado → descripción consultada. Solo presentación. */
  descripciones?: Record<string, Record<string, string>>;
}
export interface MasterDetail {
  registro: MasterRecord;
  version: string;
  /** Restricciones del registro actual; el servidor vuelve a comprobarlas al escribir. */
  camposSoloLectura?: string[];
}
export interface ClientCodeSuggestion {
  codigo: string;
}
export interface MasterError {
  error: string;
  campos?: Record<string, string>;
}
