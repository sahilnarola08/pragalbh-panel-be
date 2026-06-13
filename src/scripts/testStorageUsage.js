/**
 * Smoke test for storage usage module (run: node src/scripts/testStorageUsage.js)
 */
import "../loadDotenv.js";
import { getStorageUsageStats } from "../services/storage/storageUsageService.js";

async function run() {
  const stats = await getStorageUsageStats();

  if (!stats.provider) throw new Error("Missing provider");
  if (typeof stats.usedBytes !== "number") throw new Error("Missing usedBytes");
  if (!stats.breakdown?.images || !stats.breakdown?.videos) {
    throw new Error("Missing breakdown");
  }
  if (stats.quotaBytes != null && stats.freeBytes == null) {
    throw new Error("freeBytes should be set when quota exists");
  }
  if (stats.usedPercent != null && (stats.usedPercent < 0 || stats.usedPercent > 100)) {
    throw new Error(`Invalid usedPercent: ${stats.usedPercent}`);
  }

  console.log("✓ Provider:", stats.provider);
  console.log("✓ Used:", stats.usedBytes, "bytes");
  console.log("✓ Images:", stats.breakdown.images.fileCount, "files");
  console.log("✓ Videos:", stats.breakdown.videos.fileCount, "files");
  console.log("✓ Quota:", stats.quotaBytes ?? "unlimited");
  process.exit(0);
}

run().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
