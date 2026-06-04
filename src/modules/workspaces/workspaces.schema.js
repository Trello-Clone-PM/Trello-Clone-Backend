import { z } from "zod";

const visibility = z.enum(["private", "workspace", "public"]);
const wsRole = z.enum(["ws_owner", "ws_admin", "ws_member", "ws_guest"]);

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  visibility: visibility.optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    visibility: visibility.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: wsRole.default("ws_member"),
});
