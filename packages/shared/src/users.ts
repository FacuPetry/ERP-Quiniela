import type { MenuPermission } from "./permissions.js";
export interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  administrador: boolean;
  permisos: MenuPermission[];
  creadoEn: string;
}
export interface UserDetail {
  registro: UserRecord;
  version: string;
}
export interface UserInput {
  nombre: string;
  email: string;
  activo: boolean;
  permisos: MenuPermission[];
}
export interface UserList {
  registros: UserRecord[];
  total: number;
  pagina: number;
  limite: number;
}
