import { useSyncExternalStore } from "react";
import type { IconName } from "./components/Icon";

export const modules: {
  path: string;
  title: string;
  group: string;
  icon: IconName;
  description: string;
  detail: string;
}[] = [
  {
    path: "/cuenta-corriente",
    title: "Cuenta corriente",
    group: "Operaciones",
    icon: "account",
    description: "Deudas, créditos y movimientos pendientes de cada cliente.",
    detail:
      "Los premios se registrarán como una obligación de pago y se cancelarán desde Cobros y pagos.",
  },
  {
    path: "/cobros-pagos",
    title: "Cobros y pagos",
    group: "Operaciones",
    icon: "exchange",
    description: "Cobros y pagos con sus aplicaciones a cuenta corriente.",
    detail:
      "Cada operación podrá combinar efectivo, cheques y transferencias, registrando el movimiento de tesorería correspondiente.",
  },
  {
    path: "/tesoreria",
    title: "Tesorería",
    group: "Operaciones",
    icon: "wallet",
    description: "Cajas, aperturas, cierres y movimientos de fondos.",
    detail:
      "Ingresos y retiros de efectivo con caja abierta, conceptos y trazabilidad, sin afectar Cuenta corriente.",
  },
  {
    path: "/valores",
    title: "Valores",
    group: "Operaciones",
    icon: "values",
    description: "Consulta de cheques y transferencias desde un mismo lugar.",
    detail:
      "Los cheques conservarán su identidad e historial. Cheques y transferencias se almacenarán en tablas separadas.",
  },
  {
    path: "/tipos-cliente",
    title: "Tipos de cliente",
    group: "Maestros",
    icon: "users",
    description: "Clasificación de las cuentas comerciales.",
    detail: "",
  },
  {
    path: "/clientes",
    title: "Clientes",
    group: "Maestros",
    icon: "users",
    description: "Datos de clientes y su clasificación comercial.",
    detail:
      "El próximo ABM permitirá consultar, filtrar y mantener los registros de CLIENTE y CLIENTETIPO.",
  },
  {
    path: "/comprobantes",
    title: "Comprobantes",
    group: "Maestros",
    icon: "file",
    description: "Configuración central de los comprobantes del sistema.",
    detail:
      "Una sola tabla COMPROBANTE definirá el comportamiento de los movimientos en los distintos módulos.",
  },
  {
    path: "/numeraciones",
    title: "Numerador",
    group: "Maestros",
    icon: "file",
    description: "Series y correlativos de los comprobantes.",
    detail: "",
  },
  {
    path: "/cajas",
    title: "Cajas",
    group: "Maestros",
    icon: "box",
    description: "Identificación de las cajas del negocio.",
    detail:
      "Administrá los registros de las cajas. Sus aperturas y la selección para operar se gestionan desde Cobros y pagos.",
  },
  {
    path: "/bancos",
    title: "Bancos",
    group: "Maestros",
    icon: "bank",
    description: "Bancos, cuentas bancarias y billeteras propias.",
    detail:
      "Estos maestros serán la referencia para las transferencias y los movimientos bancarios.",
  },
  {
    path: "/cuentas-bancarias",
    title: "Cuentas bancarias",
    group: "Maestros",
    icon: "bank",
    description: "Cuentas bancarias y billeteras propias.",
    detail: "",
  },
  {
    path: "/conceptos",
    title: "Conceptos",
    group: "Maestros",
    icon: "tag",
    description: "Motivos de ingresos, egresos y ajustes.",
    detail:
      "Los conceptos se reutilizarán en los módulos que requieran clasificar movimientos.",
  },
];
export function navigate(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
const subscribe = (callback: () => void) => {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
};
export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
