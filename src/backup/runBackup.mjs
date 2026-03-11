/**
 * MongoDB backup: mongodump -> zip (archiver) -> upload to Google Drive (OAuth) -> delete local zip and dump.
 * Run from CLI: node src/backup/runBackup.mjs (uses first connected Drive integration).
 */

import "dotenv/config";
import connectDB from "../config/db.js";
import { runBackup } from "../services/runBackupService.js";

async function main() {
  await connectDB();
  await runBackup(null);
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
