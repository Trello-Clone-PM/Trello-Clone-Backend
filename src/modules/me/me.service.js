import crypto from "node:crypto";
import path from "node:path";
import { prisma } from "../../config/db.js";
import { minio, MINIO_BUCKET } from "../../config/minio.js";
import { env } from "../../config/env.js";
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

function publicUrl(key) {
  const scheme = "http";
  return `${scheme}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${MINIO_BUCKET}/${key}`;
}

export async function updateProfile(userId, input) {
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  return prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
}

export async function createAvatarUpload(userId, { filename, contentType }) {
  const ext = path.extname(filename).slice(0, 16);
  const key = `avatars/${userId}/${crypto.randomUUID()}${ext}`;
  const uploadUrl = await minio.presignedPutObject(MINIO_BUCKET, key, AVATAR_PUT_EXPIRY);
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
