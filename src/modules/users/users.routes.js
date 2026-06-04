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
