import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { dbHealthy } from "./config/db.js";
import { redisHealthy } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  app.get("/health", async (_req, res) => {
    const [db, redis] = await Promise.all([dbHealthy(), redisHealthy()]);
    const ok = db && redis;
    res
      .status(ok ? 200 : 503)
      .json({ status: ok ? "ok" : "degraded", db, redis });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
