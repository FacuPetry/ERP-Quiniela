import type { CurrentUser } from "./index.js";
export const menuOptions = [
  { key: "cuenta-corriente", label: "Cuenta corriente", group: "Operaciones" },
  { key: "cobros-pagos", label: "Cobros y pagos", group: "Operaciones" },
  { key: "tesoreria", label: "Tesorería", group: "Operaciones" },
  { key: "valores", label: "Valores", group: "Operaciones" },
  { key: "tipos-cliente", label: "Tipos de cliente", group: "Maestros" },
  { key: "clientes", label: "Clientes", group: "Maestros" },
  { key: "comprobantes", label: "Comprobantes", group: "Maestros" },
  { key: "numeraciones", label: "Numerador", group: "Maestros" },
  { key: "cajas", label: "Cajas", group: "Maestros" },
  { key: "bancos", label: "Bancos", group: "Maestros" },
  { key: "cuentas-bancarias", label: "Cuentas bancarias", group: "Maestros" },
  { key: "conceptos", label: "Conceptos", group: "Maestros" },
  { key: "sistema", label: "Estado del sistema", group: "Sistema" },
  {
    key: "informes-cuenta-corriente",
    label: "Resumen de Cuenta corriente",
    group: "Informes",
  },
] as const;
export type MenuKey = (typeof menuOptions)[number]["key"];
export interface MenuPermission {
  menu: MenuKey;
  escritura: boolean;
}
/** Catálogo congelado para conservar la lectura anterior; los módulos futuros
 * no se habilitan automáticamente en las cuentas heredadas. */
const legacyMenuKeys: readonly MenuKey[] = [
  "cuenta-corriente",
  "cobros-pagos",
  "tesoreria",
  "valores",
  "tipos-cliente",
  "clientes",
  "comprobantes",
  "numeraciones",
  "cajas",
  "bancos",
  "cuentas-bancarias",
  "conceptos",
  "sistema",
];
export const legacyReadPermissions: MenuPermission[] = legacyMenuKeys.map(
  (menu) => ({ menu, escritura: false }),
);
export function canAccessMenu(user: CurrentUser, menu: string) {
  return (
    user.rol.codigo === "ADMIN" ||
    Boolean(user.permisos?.some((p) => p.menu === menu))
  );
}
export function canWriteMenu(user: CurrentUser, menu: string) {
  return (
    user.rol.codigo === "ADMIN" ||
    Boolean(user.permisos?.some((p) => p.menu === menu && p.escritura))
  );
}
