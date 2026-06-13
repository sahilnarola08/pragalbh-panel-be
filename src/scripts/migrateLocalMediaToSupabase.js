/**
 * One-time migration: uploads existing local images/videos to Supabase buckets.
 *
 * Usage:
 *   1. Set STORAGE_PROVIDER=supabase and Supabase env vars in .env
 *   2. node src/scripts/migrateLocalMediaToSupabase.js
 *   3. Optional dry run: node src/scripts/migrateLocalMediaToSupabase.js --dry-run
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { storageConfig } from "../config/storage.js";
import { uploadBuffer, getPublicUrl } from "../services/storage/supabaseStorageService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "../..");
const dryRun = process.argv.includes("--dry-run");

function joinObjectPath(folder, filename) {
  const cleanFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
}

async function migrateFolder({ localDir, bucket, folder, contentTypeFor }) {
  if (!fs.existsSync(localDir)) {
    console.log(`Skip (folder missing): ${localDir}`);
    return { uploaded: 0, skipped: 0 };
  }

  const files = fs.readdirSync(localDir).filter((f) => fs.statSync(path.join(localDir, f)).isFile());
  let uploaded = 0;
  let skipped = 0;

  for (const filename of files) {
    const fullPath = path.join(localDir, filename);
    const objectPath = joinObjectPath(folder, filename);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      typeof contentTypeFor === "function" ? contentTypeFor(ext) : contentTypeFor;

    if (dryRun) {
      console.log(`[dry-run] would upload: ${fullPath} -> ${bucket}/${objectPath}`);
      uploaded += 1;
      continue;
    }

    const buffer = await fs.promises.readFile(fullPath);
    await uploadBuffer({
      bucket,
      objectPath,
      buffer,
      contentType,
      upsert: true,
    });
    const publicUrl = getPublicUrl(bucket, objectPath);
    console.log(`Uploaded: ${filename} -> ${publicUrl}`);
    uploaded += 1;
  }

  return { uploaded, skipped };
}

async function main() {
  if (!storageConfig.isSupabase) {
    throw new Error("Set STORAGE_PROVIDER=supabase in .env before running migration.");
  }

  console.log(dryRun ? "Starting dry-run migration..." : "Starting migration to Supabase...");

  const imageResult = await migrateFolder({
    localDir: path.join(projectRoot, storageConfig.local.imagesDir),
    bucket: storageConfig.supabase.buckets.images,
    folder: storageConfig.supabase.folders.images,
    contentTypeFor: (ext) => (ext === ".webp" ? "image/webp" : "image/jpeg"),
  });

  const videoResult = await migrateFolder({
    localDir: path.join(projectRoot, storageConfig.local.videosDir),
    bucket: storageConfig.supabase.buckets.videos,
    folder: storageConfig.supabase.folders.videos,
    contentTypeFor: (ext) => {
      const map = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
      };
      return map[ext] || "video/mp4";
    },
  });

  console.log("\nMigration summary:");
  console.log(`Images uploaded: ${imageResult.uploaded}`);
  console.log(`Videos uploaded: ${videoResult.uploaded}`);
  console.log("\nNext step: update MongoDB URLs with:");
  console.log("  npm run storage:migrate-db-urls:dry-run");
  console.log("  npm run storage:migrate-db-urls");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
