import cron from "node-cron";
import { getBackupQueue } from "./backupQueue.js";

/**
 * Daily automated backup at 02:00 server time.
 * Only enqueues a job; heavy work is done by the worker process.
 */
export function startBackupCron() {
  if (process.env.ENABLE_BACKUP_CRON !== "true") {
    return;
  }

  cron.schedule("0 2 * * *", async () => {
    try {
      const q = getBackupQueue();
      await q.add(
        "RUN_BACKUP",
        { backupType: "AUTO", createdBy: null },
        { jobId: `AUTO:${new Date().toISOString().slice(0, 10)}` }
      );
      console.log("[BackupCron] Enqueued daily backup job");
    } catch (e) {
      console.error("[BackupCron] Failed to enqueue backup:", e?.message || e);
    }
  });
}

