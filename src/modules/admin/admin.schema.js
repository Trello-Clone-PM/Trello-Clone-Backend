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

export const auditQuerySchema = z.object({
  actor: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
