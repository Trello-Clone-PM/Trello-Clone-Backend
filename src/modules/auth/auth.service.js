import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";
import { signAccessToken } from "./tokens.js";
import { BadRequest, Conflict, Unauthorized } from "../../lib/errors.js";
import { invalidateUserPerms } from "../rbac/perms.js";
import { logAudit } from "../rbac/audit.js";

const BCRYPT_ROUNDS = 10;
const refreshTtlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Issues a new access JWT + a new refresh token row. Returns the raw refresh secret.
async function issueTokens(userId, tokenVersion) {
  const accessJti = uuidv4();
  const accessToken = signAccessToken({
    user_id: userId,
    token_version: tokenVersion,
    jti: accessJti,
  });

  const refreshRaw = uuidv4();
  const refreshJti = uuidv4();
  await prisma.refreshToken.create({
    data: {
      id: refreshJti,
      userId,
      jti: refreshJti,
      tokenHash: hashToken(refreshRaw),
      expiresAt: new Date(Date.now() + refreshTtlMs),
      used: false,
    },
  });

  return { accessToken, refreshToken: refreshRaw, refreshMaxAgeMs: refreshTtlMs };
}

export async function register(email, plainPassword, name) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Conflict("Email already registered", "EMAIL_TAKEN");

  const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const userRole = await prisma.role.findUnique({ where: { key: "user" } });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      ...(userRole
        ? { userRoles: { create: { roleId: userRole.id, tenantId: null } } }
        : {}),
    },
    select: { id: true, tokenVersion: true },
  });

  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { userId: user.id, tokens };
}

export async function login(email, plainPassword, ip) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(plainPassword, user.passwordHash));
  if (!user || !ok) {
    logAudit({
      actorId: user?.id ?? "00000000-0000-0000-0000-000000000000",
      action: "auth.login.failed",
      metadata: { email },
      ipAddress: ip,
    });
    throw Unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
  }
  if (!user.isActive) throw Unauthorized("USER_INACTIVE", "Account is disabled");

  logAudit({ actorId: user.id, action: "auth.login.success", ipAddress: ip });
  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { userId: user.id, tokens };
}

// Rotate refresh token. Detects reuse of an already-used token => revoke everything.
export async function renew(rawRefresh) {
  if (!rawRefresh) throw Unauthorized("NO_REFRESH", "Missing refresh token");

  const tokenHash = hashToken(rawRefresh);
  const record = await prisma.refreshToken.findFirst({ where: { tokenHash } });

  if (!record || record.expiresAt < new Date()) {
    throw Unauthorized("INVALID_REFRESH", "Invalid refresh token");
  }

  if (record.used) {
    // Reuse detected -> revoke all sessions for this user.
    await revokeAllForUser(record.userId);
    logAudit({
      actorId: record.userId,
      action: "auth.refresh.reuse_detected",
    });
    throw Unauthorized("REFRESH_REUSE", "Refresh token reuse detected");
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, tokenVersion: true, isActive: true },
  });
  if (!user || !user.isActive) throw Unauthorized("USER_INACTIVE", "User not active");

  await prisma.refreshToken.update({ where: { id: record.id }, data: { used: true } });
  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { userId: user.id, tokens };
}

export async function logout(params) {
  const ttl = params.accessExp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`revoked_jti:${params.accessJti}`, "1", "EX", ttl).catch(() => undefined);
  }
  if (params.rawRefresh) {
    await prisma.refreshToken.deleteMany({
      where: { tokenHash: hashToken(params.rawRefresh) },
    });
  }
}

async function revokeAllForUser(userId) {
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
  await invalidateUserPerms(userId);
}

export async function logoutAll(userId) {
  await revokeAllForUser(userId);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw BadRequest("User not found");
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw Unauthorized("WRONG_PASSWORD", "Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Bump token_version + drop refresh tokens => force re-login everywhere.
  await revokeAllForUser(userId);
}
