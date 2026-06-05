import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { BadRequest, NotFound, Forbidden } from "../../lib/errors.js";
import { invalidateUserPerms, getUserRoleKeys, getUserPermissions } from "../rbac/perms.js";
import { logAudit } from "../rbac/audit.js";
import { signAccessToken } from "../auth/tokens.js";

const BCRYPT_ROUNDS = 10;

export async function getStats() {
  const [total, active, workspaces, boards, storage] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.workspace.count(),
    prisma.board.count(),
    prisma.attachment.aggregate({ _sum: { size: true } }),
  ]);
  return {
    users: { total, active, suspended: total - active },
    workspaces: { total: workspaces },
    boards: { total: boards },
    storage: { bytes: storage._sum.size ?? 0 },
  };
}

export async function listUsers({ search, page, pageSize }) {
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const data = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    roles: [...new Set(u.userRoles.map((r) => r.role.key))],
    createdAt: u.createdAt,
  }));
  return { data, total };
}

export async function suspendUser(actorId, targetId, suspend, ctx) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!user) throw NotFound("User not found");
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive: !suspend, ...(suspend ? { tokenVersion: { increment: 1 } } : {}) },
    select: { id: true, email: true, name: true, isActive: true, createdAt: true },
  });
  await invalidateUserPerms(targetId);
  logAudit({
    actorId,
    targetId,
    action: suspend ? "admin.user.suspended" : "admin.user.unsuspended",
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return updated;
}

export async function assignRole(actorId, { userId, roleKey, tenantId }, ctx) {
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } }),
  ]);
  if (!user) throw NotFound("User not found");
  if (!role) throw BadRequest(`Unknown role: ${roleKey}`, "UNKNOWN_ROLE");

  const tenant = tenantId ?? null;
  const existing = await prisma.userRole.findFirst({
    where: { userId, roleId: role.id, tenantId: tenant },
  });
  if (!existing) {
    await prisma.userRole.create({
      data: { userId, roleId: role.id, tenantId: tenant, grantedBy: actorId },
    });
  }
  await invalidateUserPerms(userId);
  logAudit({
    actorId,
    targetId: userId,
    action: "admin.role.assigned",
    metadata: { roleKey, tenantId: tenant },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return { status: "ok" };
}

export async function listWorkspaces({ search, page, pageSize }) {
  const where = search ? { name: { contains: search, mode: "insensitive" } } : {};
  const [rows, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        visibility: true,
        isLocked: true,
        createdAt: true,
        ownerId: true,
        owner: { select: { email: true } },
        _count: { select: { boards: true } },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  const wsIds = rows.map((w) => w.id);
  const memberGroups = wsIds.length
    ? await prisma.userRole.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: wsIds } },
        _count: { userId: true },
      })
    : [];
  const memberCount = new Map(memberGroups.map((g) => [g.tenantId, g._count.userId]));

  const data = rows.map((w) => ({
    id: w.id,
    name: w.name,
    visibility: w.visibility,
    isLocked: w.isLocked,
    ownerId: w.ownerId,
    ownerEmail: w.owner.email,
    boardCount: w._count.boards,
    memberCount: memberCount.get(w.id) ?? 0,
    createdAt: w.createdAt,
  }));
  return { data, total };
}

export async function deleteWorkspace(actorId, workspaceId, ctx) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) throw NotFound("Workspace not found");
  await prisma.workspace.delete({ where: { id: workspaceId } });
  logAudit({
    actorId,
    targetId: workspaceId,
    action: "admin.workspace.deleted",
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
}

export async function listAudit({ actor, action, from, to, page, pageSize }) {
  const where = {
    ...(actor ? { actorId: actor } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.accessAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accessAudit.count({ where }),
  ]);

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(actors.map((a) => [a.id, a.email]));

  const data = rows.map((r) => ({
    id: r.id.toString(),
    actorId: r.actorId,
    actorEmail: emailById.get(r.actorId) ?? null,
    action: r.action,
    targetId: r.targetId,
    metadata: r.metadata,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt,
  }));
  return { data, total };
}

export async function getUserDetail(targetId) {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isActive: true,
      createdAt: true,
      userRoles: {
        select: {
          tenantId: true,
          role: { select: { key: true, name: true } },
        },
      },
      ownedWorkspaces: { select: { id: true, name: true } },
    },
  });
  if (!user) throw NotFound("User not found");

  const wsTenantIds = [...new Set(user.userRoles.map((r) => r.tenantId).filter(Boolean))];
  const memberWorkspaces = wsTenantIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: wsTenantIds } },
        select: { id: true, name: true },
      })
    : [];

  const activityCount = await prisma.activity.count({ where: { actorId: targetId } });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
    roles: user.userRoles.map((r) => ({
      key: r.role.key,
      name: r.role.name,
      tenantId: r.tenantId,
    })),
    ownedWorkspaces: user.ownedWorkspaces,
    memberWorkspaces,
    activityCount,
  };
}

function generatePassword() {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12) + "A1!";
}

export async function resetPassword(actorId, targetId, newPassword, ctx) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!user) throw NotFound("User not found");

  const password = newPassword || generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: targetId } }),
  ]);
  await invalidateUserPerms(targetId);

  logAudit({
    actorId,
    targetId,
    action: "admin.user.password_reset",
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return { status: "ok", password };
}

export async function deleteUser(actorId, targetId, ctx) {
  if (actorId === targetId) throw BadRequest("You cannot delete yourself", "SELF_DELETE");
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true },
  });
  if (!user) throw NotFound("User not found");
  if (user.email === env.SEED_ADMIN_EMAIL) {
    throw Forbidden("Cannot delete the seeded super admin");
  }

  await prisma.user.delete({ where: { id: targetId } });
  await invalidateUserPerms(targetId);
  logAudit({
    actorId,
    targetId,
    action: "admin.user.deleted",
    metadata: { email: user.email },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return { status: "ok" };
}

export async function impersonate(actorId, targetId, ctx) {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, name: true, avatarUrl: true, isActive: true, tokenVersion: true },
  });
  if (!user) throw NotFound("User not found");
  if (!user.isActive) throw BadRequest("Cannot impersonate an inactive user");

  const accessToken = signAccessToken({
    user_id: user.id,
    token_version: user.tokenVersion,
    jti: uuidv4(),
    impersonated_by: actorId,
  });
  const [roles, permissions] = await Promise.all([
    getUserRoleKeys(user.id),
    getUserPermissions(user.id),
  ]);

  logAudit({
    actorId,
    targetId,
    action: "user.impersonate",
    metadata: { email: user.email },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      roles,
      permissions,
    },
  };
}

export async function updateWorkspace(actorId, workspaceId, input, ctx) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) throw NotFound("Workspace not found");
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    },
    select: { id: true, name: true, visibility: true, isLocked: true },
  });
  logAudit({
    actorId,
    targetId: workspaceId,
    action: "admin.workspace.updated",
    metadata: input,
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return updated;
}

export async function transferOwner(actorId, workspaceId, newOwnerId, ctx) {
  const [ws, newOwner] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, ownerId: true } }),
    prisma.user.findUnique({ where: { id: newOwnerId }, select: { id: true } }),
  ]);
  if (!ws) throw NotFound("Workspace not found");
  if (!newOwner) throw BadRequest("New owner not found", "OWNER_NOT_FOUND");

  const ownerRole = await prisma.role.findUnique({ where: { key: "ws_owner" }, select: { id: true } });

  await prisma.workspace.update({ where: { id: workspaceId }, data: { ownerId: newOwnerId } });
  if (ownerRole) {
    const existing = await prisma.userRole.findFirst({
      where: { userId: newOwnerId, roleId: ownerRole.id, tenantId: workspaceId },
    });
    if (!existing) {
      await prisma.userRole.create({
        data: { userId: newOwnerId, roleId: ownerRole.id, tenantId: workspaceId, grantedBy: actorId },
      });
    }
    await invalidateUserPerms(newOwnerId);
  }

  logAudit({
    actorId,
    targetId: workspaceId,
    action: "admin.workspace.owner_transferred",
    metadata: { from: ws.ownerId, to: newOwnerId },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return { status: "ok" };
}

export async function lockWorkspace(actorId, workspaceId, locked, ctx) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) throw NotFound("Workspace not found");
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { isLocked: locked },
    select: { id: true, name: true, isLocked: true },
  });
  logAudit({
    actorId,
    targetId: workspaceId,
    action: locked ? "admin.workspace.locked" : "admin.workspace.unlocked",
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });
  return updated;
}

export async function getStorage() {
  const [total, byWsRows, byUserRows] = await Promise.all([
    prisma.attachment.aggregate({ _sum: { size: true } }),
    prisma.$queryRaw`
      SELECT w.id AS "workspaceId", w.name AS name, COALESCE(SUM(a.size), 0)::bigint AS bytes
      FROM attachments a
      JOIN cards c ON c.id = a.card_id
      JOIN lists l ON l.id = c.list_id
      JOIN boards b ON b.id = l.board_id
      JOIN workspaces w ON w.id = b.workspace_id
      GROUP BY w.id, w.name
      ORDER BY bytes DESC
      LIMIT 100`,
    prisma.attachment.groupBy({
      by: ["uploaderId"],
      _sum: { size: true },
      orderBy: { _sum: { size: "desc" } },
      take: 100,
    }),
  ]);

  const userIds = byUserRows.map((r) => r.uploaderId);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return {
    totalBytes: Number(total._sum.size ?? 0),
    byWorkspace: byWsRows.map((r) => ({
      workspaceId: r.workspaceId,
      name: r.name,
      bytes: Number(r.bytes),
    })),
    byUser: byUserRows.map((r) => ({
      userId: r.uploaderId,
      email: emailById.get(r.uploaderId) ?? null,
      bytes: Number(r._sum.size ?? 0),
    })),
  };
}
