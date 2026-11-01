import { z } from "zod";
import { listOrderFields } from "../database/list-order-validation.js";
export const summaryQuery = z
  .object({
    ...listOrderFields,
    q: z.string().trim().max(100).default(""),
    Cliente: z.string().trim().max(20).optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type SummaryQuery = z.infer<typeof summaryQuery>;
