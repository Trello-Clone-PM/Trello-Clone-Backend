import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import { prisma } from "../../config/db.js";
import { getUserPermissions } from "../rbac/perms.js";
import { Unauthorized } from "../../lib/errors.js";

export const usersRouter = Router();

// GET /api/me — user + roles + permissions for FE gating.
usersRouter.get(
  "/me",
  authenticate,
  ah(async (req, res) => {
    const authUser = req.user;
    if (!authUser) throw Unauthorized();

    const [user, permissions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: authUser.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          isActive: true,
          settings: true,
          createdAt: true,
        },
      }),
      getUserPermissions(authUser.id),
    ]);
    if (!user) throw Unauthorized();

    res.json({ user, roles: authUser.roles, permissions });
  }),
);

// GET /api/users/search?q= — autocomplete users by name/email (authenticated).
usersRouter.get(
  "/users/search",
  authenticate,
  ah(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) return res.json([]);
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      take: 8,
      orderBy: { email: "asc" },
    });
    res.json(users);
  }),
);
