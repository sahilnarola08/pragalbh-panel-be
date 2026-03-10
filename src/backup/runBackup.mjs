import "dotenv/config";
import connectDB from "../config/db.js";
import { runBackupJob } from "../services/backupService.js";

async function main() {
  await connectDB();
  const backupType = process.env.BACKUP_TYPE === "MANUAL" ? "MANUAL" : "AUTO";
  const createdBy = process.env.BACKUP_CREATED_BY || null;
  await runBackupJob({ backupType, createdBy });
}

main()
  .then(() => {
    console.log("[BackupRunner] Backup completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[BackupRunner] Backup failed:", err);
    process.exit(1);
  });

