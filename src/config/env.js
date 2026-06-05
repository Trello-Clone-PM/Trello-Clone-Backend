import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  // Set true only when served over HTTPS (e.g. behind TLS/Cloudflare). Over plain
  // HTTP (IP access) keep false or the refresh cookie won't be sent.
  COOKIE_SECURE: z.coerce.boolean().default(false),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  MINIO_ENDPOINT: z.string().default("minio"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_BUCKET: z.string().default("trello"),
  // Browser-reachable MinIO base URL (presign host + public file URLs). e.g. http://<vps-ip>:9000
  MINIO_PUBLIC_URL: z.string().default("http://localhost:9000"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@trello.local"),
  SEED_ADMIN_PASSWORD: z.string().default("Admin@12345"),
  // When false (e.g. Prod), the seed does NOT create a super_admin user, so the
  // one-time first-run setup page is shown to create it.
  SEED_SUPER_ADMIN: z.coerce.boolean().default(true),
  APP_URL: z.string().default("http://localhost:5173"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("Trello Clone <no-reply@trello.local>"),
  ENABLE_WORKERS: z.coerce.boolean().default(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
