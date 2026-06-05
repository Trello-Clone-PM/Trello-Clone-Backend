import crypto from "node:crypto";
import path from "node:path";
import { prisma } from "../../config/db.js";
import { minioPublic, MINIO_BUCKET, publicUrl } from "../../config/minio.js";
import { BadRequest, NotFound } from "../../lib/errors.js";
import { logoutAll } from "../auth/auth.service.js";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  isActive: true,
  settings: true,
  createdAt: true,
};

const AVATAR_PUT_EXPIRY = 5 * 60; // seconds

export async function updateProfile(userId, input) {
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  return prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
}

export async function createAvatarUpload(userId, { filename, contentType }) {
  const ext = path.extname(filename).slice(0, 16);
  const key = `avatars/${userId}/${crypto.randomUUID()}${ext}`;
  const uploadUrl = await minioPublic.presignedPutObject(MINIO_BUCKET, key, AVATAR_PUT_EXPIRY);
  return { uploadUrl, fileUrl: publicUrl(key), key, contentType };
}

export async function getSettings(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
  if (!user) throw NotFound("User not found");
  return user.settings ?? {};
}

export async function updateSettings(userId, settings) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
  if (!user) throw NotFound("User not found");
  const merged = { ...(user.settings ?? {}), ...settings };
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { settings: merged },
    select: { settings: true },
  });
  return updated.settings ?? {};
}

// Aggregate stats for the personal dashboard: cards the user is a member of.
export async function getDashboard(userId) {
  const cards = await prisma.card.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      dueDate: true,
      archived: true,
      list: { select: { board: { select: { id: true, name: true } } } },
    },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const bucket = { overdue: 0, today: 0, week: 0, later: 0, none: 0 };
  const byBoardMap = new Map();
  let assigned = 0;
  let completed = 0;
  let overdue = 0;
  let dueToday = 0;
  let dueThisWeek = 0;

  for (const c of cards) {
    if (c.archived) { completed += 1; continue; }
    assigned += 1;
    const board = c.list.board;
    byBoardMap.set(board.id, { boardId: board.id, name: board.name, count: (byBoardMap.get(board.id)?.count ?? 0) + 1 });

    if (!c.dueDate) { bucket.none += 1; continue; }
    const d = new Date(c.dueDate);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day < today) { bucket.overdue += 1; overdue += 1; }
    else if (day.getTime() === today.getTime()) { bucket.today += 1; dueToday += 1; dueThisWeek += 1; }
    else if (day <= weekEnd) { bucket.week += 1; dueThisWeek += 1; }
    else bucket.later += 1;
  }

  return {
    totals: { assigned, completed, overdue, dueToday, dueThisWeek },
    byBucket: bucket,
    byBoard: [...byBoardMap.values()].sort((a, b) => b.count - a.count),
  };
}

// Soft-delete: deactivate account + revoke all sessions. Super admin cannot self-delete.
export async function deactivateSelf(userId) {
  const seed = await prisma.user.findUnique({
    where: { email: env.SEED_ADMIN_EMAIL },
    select: { id: true },
  });
  if (seed && seed.id === userId) {
    throw BadRequest("The super admin account cannot be deleted", "CANNOT_DELETE_SUPER_ADMIN");
  }
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  await logoutAll(userId);
}
