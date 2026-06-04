import { z } from "zod";

export const createListSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(160),
  position: z.number().optional(),
});

export const updateListSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    position: z.number().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
