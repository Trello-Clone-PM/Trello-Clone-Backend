import { prisma } from "../../config/db.js";
import { BadRequest, NotFound } from "../../lib/errors.js";
import { invalidateUserPerms } from "../rbac/perms.js";
import { logAudit } from "../rbac/audit.js";

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
        createdAt: true,
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
