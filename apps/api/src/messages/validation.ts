import { z } from "zod";
import { messageBalanceFilters } from "@erp/shared";
import { listOrderFields } from "../database/list-order-validation.js";
const paging = {
  ...listOrderFields,
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
};
export const messageClientsQuery = z
  .object({
    ...paging,
    q: z.string().trim().max(100).default(""),
    ClienteTipo: z.string().trim().min(1).max(20).optional(),
    Saldo: z.enum(messageBalanceFilters.map((s) => s.value)).default("NO_CERO"),
    Estado: z.enum(["ACTIVOS", "INACTIVOS", "TODOS"]).default("ACTIVOS"),
  })
  .strict();
export type MessageClientsQuery = z.infer<typeof messageClientsQuery>;
