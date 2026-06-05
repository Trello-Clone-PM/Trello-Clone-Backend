import { z } from "zod";

export const paginationSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const suspendSchema = z.object({
  suspend: z.boolean(),
});

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.string().min(1),
  tenantId: z.string().uuid().nullable().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128).optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    visibility: z.enum(["private", "workspace", "public"]).optional(),
  })
  .refine((d) => d.name !== undefined || d.visibility !== undefined, {
    message: "Provide name or visibility",
  });

export const transferOwnerSchema = z.object({
  newOwnerId: z.string().uuid(),
});

export const lockSchema = z.object({
  locked: z.boolean(),
});

export const auditQuerySchema = z.object({
  actor: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
