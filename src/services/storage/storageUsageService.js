import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { storageConfig } from "../../config/storage.js";
import { getFolderUsage } from "./supabaseStorageService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "../../..");

function getLocalDirUsage(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { totalBytes: 0, fileCount: 0 };
  }

  let totalBytes = 0;
  let fileCount = 0;

  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;
    totalBytes += stat.size;
    fileCount += 1;
  }

  return { totalBytes, fileCount };
}

function buildUsageSummary({ usedBytes, breakdown, provider, bucket, quotaBytes }) {
  const freeBytes =
    quotaBytes != null ? Math.max(quotaBytes - usedBytes, 0) : null;
  const usedPercent =
    quotaBytes != null && quotaBytes > 0
      ? Math.min(Math.round((usedBytes / quotaBytes) * 1000) / 10, 100)
      : null;

  return {
    provider,
    bucket: bucket || null,
    quotaBytes,
    usedBytes,
    freeBytes,
    usedPercent,
    breakdown,
    calculatedAt: new Date().toISOString(),
  };
}

export async function getStorageUsageStats() {
  const quotaBytes = storageConfig.quotaBytes;

  if (storageConfig.isSupabase) {
    const bucket = storageConfig.supabase.buckets.images;
    const imageFolder = storageConfig.supabase.folders.images;
    const videoFolder = storageConfig.supabase.folders.videos;

    const [images, videos, root] = await Promise.all([
      getFolderUsage(bucket, imageFolder),
      getFolderUsage(bucket, videoFolder),
      getFolderUsage(bucket, ""),
    ]);

    const usedBytes = root.totalBytes;
    const breakdown = {
      images: {
        label: "Images",
        folder: imageFolder,
        bytes: images.totalBytes,
        fileCount: images.fileCount,
      },
      videos: {
        label: "Videos",
        folder: videoFolder,
        bytes: videos.totalBytes,
        fileCount: videos.fileCount,
      },
      other: {
        label: "Other",
        folder: "(root & misc)",
        bytes: Math.max(usedBytes - images.totalBytes - videos.totalBytes, 0),
        fileCount: Math.max(root.fileCount - images.fileCount - videos.fileCount, 0),
      },
    };

    return buildUsageSummary({
      usedBytes,
      breakdown,
      provider: "supabase",
      bucket,
      quotaBytes,
    });
  }

  const imagesDir = path.join(projectRoot, storageConfig.local.imagesDir);
  const videosDir = path.join(projectRoot, storageConfig.local.videosDir);

  const images = getLocalDirUsage(imagesDir);
  const videos = getLocalDirUsage(videosDir);
  const usedBytes = images.totalBytes + videos.totalBytes;

  return buildUsageSummary({
    usedBytes,
    breakdown: {
      images: {
        label: "Images",
        folder: storageConfig.local.imagesDir,
        bytes: images.totalBytes,
        fileCount: images.fileCount,
      },
      videos: {
        label: "Videos",
        folder: storageConfig.local.videosDir,
        bytes: videos.totalBytes,
        fileCount: videos.fileCount,
      },
      other: {
        label: "Other",
        folder: "—",
        bytes: 0,
        fileCount: 0,
      },
    },
    provider: "local",
    bucket: null,
    quotaBytes,
  });
}
