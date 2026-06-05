import { env } from "../config/env.js";
import { startEmailWorker } from "./email.worker.js";
import { startRemindersWorker, scheduleReminders } from "./reminders.js";

// Boot background workers + recurring jobs. No-op when ENABLE_WORKERS is false
// (e.g. to run a dedicated worker process separately).
export async function startWorkers() {
  if (!env.ENABLE_WORKERS) return [];
  const workers = [startEmailWorker(), startRemindersWorker()];
  await scheduleReminders().catch((e) => console.error("scheduleReminders failed:", e.message));
  console.log("Background workers started (email, reminders)");
  return workers;
}
