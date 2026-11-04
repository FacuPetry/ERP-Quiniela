import { z } from "zod";
import { maxSelectedMessageClients, messageBalanceFilters } from "@erp/shared";
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
    Saldo: z
      .enum(messageBalanceFilters.map((s) => s.value))
      .default("POSITIVO"),
    Estado: z.enum(["ACTIVOS", "INACTIVOS", "TODOS"]).default("ACTIVOS"),
  })
  .strict();
export const selectedMessageClients = z
  .object({
    ...paging,
    Clientes: z
      .array(z.string().trim().min(1).max(20))
      .min(1)
      .max(maxSelectedMessageClients)
      .refine(
        (codes) => new Set(codes).size === codes.length,
        "No repitas clientes.",
      ),
  })
  .strict();
export type MessageClientsQuery = z.infer<typeof messageClientsQuery>;
export type SelectedMessageClients = z.infer<typeof selectedMessageClients>;
