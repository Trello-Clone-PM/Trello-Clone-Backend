import { Client } from "minio";
import { env } from "./env.js";

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: false,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const MINIO_BUCKET = env.MINIO_BUCKET;

export async function ensureBucket() {
  const exists = await minio.bucketExists(MINIO_BUCKET).catch(() => false);
  if (!exists) await minio.makeBucket(MINIO_BUCKET);
}
