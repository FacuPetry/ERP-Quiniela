import { z } from "zod";
export const listOrderFields = {
  orden: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,49}$/)
    .optional(),
  direccion: z.enum(["asc", "desc"]).optional(),
};
