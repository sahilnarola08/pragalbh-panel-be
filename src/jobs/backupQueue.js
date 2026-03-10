import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";

function getConnection() {
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required for backup queue");
  }
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return { connection };
}

export const BACKUP_QUEUE_NAME = "database-backups";

export function getBackupQueue() {
  return new Queue(BACKUP_QUEUE_NAME, {
    ...getConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 1,
    },
  });
}

