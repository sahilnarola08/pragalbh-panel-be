import "dotenv/config";
import connectDB from "../config/db.js";
import { runRestoreJob } from "../services/backupService.js";

async function main() {
  const backupId = process.env.BACKUP_ID;
  if (!backupId) {
    throw new Error("BACKUP_ID env var is required for restore");
  }
  await connectDB();
  const requestedBy = process.env.RESTORE_REQUESTED_BY || null;
  await runRestoreJob({ backupId, requestedBy });
}

main()
  .then(() => {
    console.log("[BackupRunner] Restore completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[BackupRunner] Restore failed:", err);
    process.exit(1);
  });

