import { z } from "zod";

const visibility = z.enum(["private", "workspace", "public"]);

export const createBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(160),
  background: z.string().max(512).optional(),
  visibility: visibility.optional(),
});

export const updateBoardSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    background: z.string().max(512).nullable().optional(),
    visibility: visibility.optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
