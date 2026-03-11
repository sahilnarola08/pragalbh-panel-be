import cron from "node-cron";
import { runBackup } from "../services/runBackupService.js";

const CRON_SCHEDULE = "0 2 * * *"; // Daily at 02:00 AM

export function startBackupScheduler() {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      console.log("[BackupScheduler] Starting scheduled backup");
      await runBackup();
      console.log("[BackupScheduler] Scheduled backup completed");
    } catch (err) {
      console.error("[BackupScheduler] Scheduled backup failed:", err.message);
    }
  });
  console.log("[BackupScheduler] Daily backup scheduled at 02:00 AM");
}
