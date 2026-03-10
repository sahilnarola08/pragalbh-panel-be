import { Worker } from "bullmq";
import IORedis from "ioredis";
import { BACKUP_QUEUE_NAME } from "./backupQueue.js";
import { runBackupJob, runRestoreJob } from "../services/backupService.js";

const REDIS_URL = process.env.REDIS_URL || "";

function getConnection() {
  if (!REDIS_URL) throw new Error("REDIS_URL is required to run backup worker");
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return { connection };
}

export function startBackupWorker() {
  const worker = new Worker(
    BACKUP_QUEUE_NAME,
    async (job) => {
      if (job.name === "RUN_BACKUP") {
        return runBackupJob(job.data || {});
      }
      if (job.name === "RESTORE_BACKUP") {
        return runRestoreJob(job.data || {});
      }
      throw new Error(`Unknown job: ${job.name}`);
    },
    {
      ...getConnection(),
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[BackupWorker] Job completed: ${job.id} (${job.name})`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[BackupWorker] Job failed: ${job?.id} (${job?.name})`, err?.message || err);
  });

  return worker;
}

// Allow running as a standalone worker process: `node src/jobs/backupWorker.js`
if (process.env.RUN_BACKUP_WORKER === "true") {
  startBackupWorker();
  console.log("[BackupWorker] Started");
}

