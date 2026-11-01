import { Router, type ErrorRequestHandler } from "express";
import {
  canAccessMenu,
  type MasterKey,
  type MenuKey,
  type SessionResponse,
} from "@erp/shared";
import type { AuthService } from "../auth/service.js";
import { requireMenu, requireSession } from "../auth/middleware.js";
import type { MasterStore } from "../masters/store.js";
import type { CurrentAccountStore } from "../current-account/store.js";
import type { CashMovementStore } from "../cash-movement/store.js";
import {
  definition,
  listQuery,
  MasterRequestError,
} from "../masters/validation.js";
// Datos auxiliares de una operación habilitada; no conceden acceso al ABM,
// sus escrituras ni sus listados completos. Respuesta de maestros proyectada.
const dependencies: Partial<Record<MasterKey, readonly MenuKey[]>> = {
  clientes: ["cuenta-corriente", "cobros-pagos", "informes-cuenta-corriente"],
  "tipos-cliente": ["clientes"],
  bancos: ["cuentas-bancarias", "valores"],
  "cuentas-bancarias": ["valores"],
  cajas: ["cobros-pagos", "tesoreria", "numeraciones", "comprobantes"],
  numeraciones: ["comprobantes"],
  comprobantes: ["comprobantes"],
};
function selectedFields(key: MasterKey) {
  if (key === "clientes") return ["Codigo", "Nombre", "Activo"];
  if (key === "cuentas-bancarias")
    return ["Codigo", "Banco", "Nombre", "Activo"];
  if (key === "numeraciones")
    return ["Codigo", "ProximoNumero", "Caja", "Activo"];
  if (key === "comprobantes")
    return [
      "Codigo",
      "Descripcion",
      "Activo",
      "ModuloOrigen",
      "Cuenta",
      "Naturaleza",
      "SentidoFondos",
      "EsReversion",
    ];
  return ["Codigo", "Descripcion", "Nombre", "Activo"];
}
export function referencesRouter(
  auth: AuthService,
  masters?: MasterStore,
  accounts?: CurrentAccountStore,
  cash?: CashMovementStore,
) {
  const r = Router();
  r.use(requireSession(auth));
  if (accounts)
    r.get(
      "/cuenta-corriente/opciones",
      requireMenu("cuenta-corriente", "valores"),
      async (_req, res) => res.json(await accounts.options()),
    );
  if (accounts)
    r.get(
      "/cuenta-corriente/:id",
      requireMenu("cuenta-corriente", "cobros-pagos", "valores"),
      async (req, res) => {
        const user = (res.locals.session as SessionResponse).usuario;
        const detail = await accounts.get(String(req.params.id));
        if (
          !canAccessMenu(user, "cuenta-corriente") &&
          !(
            canAccessMenu(user, "cobros-pagos") &&
            detail.registro.Naturaleza === "DEUDA"
          ) &&
          !(canAccessMenu(user, "valores") && detail.registro.ChequeEvento)
        ) {
          throw new MasterRequestError(
            403,
            "No tenés acceso a este documento.",
          );
        }
        res.json(detail);
      },
    );
  if (cash)
    r.get(
      "/caja-movimiento/:id",
      requireMenu("cobros-pagos", "valores"),
      async (req, res) => {
        const user = (res.locals.session as SessionResponse).usuario;
        const detail = await cash.get(String(req.params.id));
        if (!canAccessMenu(user, "cobros-pagos") && !detail.valores.length)
          throw new MasterRequestError(
            403,
            "La operación no tiene valores relacionados.",
          );
        res.json(detail);
      },
    );
  if (masters) {
    r.use((req, res, next) => {
      const key = definition(req.path.split("/")[1] ?? "").key;
      const user = (res.locals.session as SessionResponse).usuario;
      if (
        ![key, ...(dependencies[key] ?? [])].some((menu) =>
          canAccessMenu(user, menu),
        )
      )
        throw new MasterRequestError(403, "No tenés acceso a esta referencia.");
      next();
    });
    r.get("/:master", async (req, res) => {
      const m = definition(String(req.params.master));
      const q = listQuery.safeParse(req.query);
      if (!q.success)
        throw new MasterRequestError(400, "Revisá los criterios de búsqueda.");
      const result = await masters.list(m, q.data);
      const fields = canAccessMenu(
        (res.locals.session as SessionResponse).usuario,
        m.key,
      )
        ? Object.keys(result.registros[0] ?? {})
        : selectedFields(m.key);
      res.json({
        ...result,
        registros: result.registros.map((row) =>
          Object.fromEntries(
            fields.filter((f) => f in row).map((f) => [f, row[f]]),
          ),
        ),
      });
    });
    r.get("/:master/:code", async (req, res) => {
      const m = definition(String(req.params.master)),
        result = await masters.get(m, String(req.params.code));
      const fields = canAccessMenu(
        (res.locals.session as SessionResponse).usuario,
        m.key,
      )
        ? Object.keys(result.registro)
        : selectedFields(m.key);
      res.json({
        ...result,
        registro: Object.fromEntries(
          fields
            .filter((f) => f in result.registro)
            .map((f) => [f, result.registro[f]]),
        ),
      });
    });
  }
  const errors: ErrorRequestHandler = (e, _req, res, next) => {
    if (e instanceof MasterRequestError)
      res.status(e.status).json({ error: e.message });
    else next(e);
  };
  r.use(errors);
  return r;
}
