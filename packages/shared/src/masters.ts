/** Descripción pública de los formularios y contratos de los primeros maestros. */
export type MasterKey =
  | "tipos-cliente"
  | "clientes"
  | "conceptos"
  | "cajas"
  | "bancos"
  | "cuentas-bancarias";
export interface MasterField {
  name: string;
  label: string;
  maxLength: number;
  required?: boolean;
  kind?: "email" | "textarea" | "relation";
  relation?: MasterKey;
}
export interface MasterDefinition {
  key: MasterKey;
  title: string;
  singular: string;
  feminine?: boolean;
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
  Codigo: string;
  Activo: boolean;
  [field: string]: string | boolean | null;
}
export interface MasterList {
  registros: MasterRecord[];
  total: number;
  pagina: number;
  limite: number;
}
export interface MasterDetail {
  registro: MasterRecord;
  version: string;
}
export interface MasterError {
  error: string;
  campos?: Record<string, string>;
}
