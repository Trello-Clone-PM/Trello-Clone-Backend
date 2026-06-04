import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { redis } from "./config/redis.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
