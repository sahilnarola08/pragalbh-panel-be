import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { storageConfig } from "../../config/storage.js";
import {
  deleteObject,
  isSupabasePublicUrl,
  parseSupabasePublicUrl,
  uploadBuffer,
} from "./supabaseStorageService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "../../..");

const imageUploadDir = path.join(projectRoot, storageConfig.local.imagesDir);
const videoUploadDir = path.join(projectRoot, storageConfig.local.videosDir);

function ensureLocalDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function joinObjectPath(folder, filename) {
  const cleanFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
}

export function isUsingSupabase() {
  return storageConfig.isSupabase;
}

export async function saveImageBuffer({ buffer, filename }) {
  if (storageConfig.isSupabase) {
    const bucket = storageConfig.supabase.buckets.images;
    const objectPath = joinObjectPath(storageConfig.supabase.folders.images, filename);
    const publicUrl = await uploadBuffer({
      bucket,
      objectPath,
      buffer,
      contentType: "image/webp",
    });
    return {
      filename,
      imageUrl: publicUrl,
      storageKey: objectPath,
      storageBucket: bucket,
    };
  }

  ensureLocalDir(imageUploadDir);
  const outputPath = path.join(imageUploadDir, filename);
  await fs.promises.writeFile(outputPath, buffer);

  return {
    filename,
    imageUrl: `/images/${filename}`,
    outputPath,
  };
}

export async function saveVideoBuffer({ buffer, filename, mimetype }) {
  if (storageConfig.isSupabase) {
    const bucket = storageConfig.supabase.buckets.videos;
    const objectPath = joinObjectPath(storageConfig.supabase.folders.videos, filename);
    const publicUrl = await uploadBuffer({
      bucket,
      objectPath,
      buffer,
      contentType: mimetype || "video/mp4",
    });
    return {
      filename,
      videoUrl: publicUrl,
      storageKey: objectPath,
      storageBucket: bucket,
    };
  }

  ensureLocalDir(videoUploadDir);
  const outputPath = path.join(videoUploadDir, filename);
  await fs.promises.writeFile(outputPath, buffer);

  return {
    filename,
    videoUrl: `/uploads/videos/${filename}`,
    outputPath,
  };
}

export function getImageUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return filename;
  }
  if (filename.startsWith("/uploads/images/")) {
    return filename.replace("/uploads/images/", "/images/");
  }
  if (filename.startsWith("/images/")) {
    return filename;
  }
  return `/images/${filename}`;
}

export function getVideoUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return filename;
  }
  if (filename.startsWith("/uploads/videos/")) {
    return filename;
  }
  return `/uploads/videos/${filename}`;
}

export async function deleteImageFile(imagePath) {
  if (!imagePath) return;

  if (isSupabasePublicUrl(imagePath)) {
    const parsed = parseSupabasePublicUrl(imagePath);
    if (parsed) {
      await deleteObject(parsed);
    }
    return;
  }

  let filename;
  if (imagePath.includes("/uploads/images/")) {
    filename = imagePath.split("/uploads/images/")[1];
  } else if (imagePath.includes("/images/")) {
    filename = imagePath.split("/images/")[1];
  } else if (path.isAbsolute(imagePath)) {
    filename = path.basename(imagePath);
  } else {
    filename = imagePath;
  }

  if (!filename) return;

  const filePath = path.join(imageUploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export async function deleteVideoFile(videoPath) {
  if (!videoPath) return;

  if (isSupabasePublicUrl(videoPath)) {
    const parsed = parseSupabasePublicUrl(videoPath);
    if (parsed) {
      await deleteObject(parsed);
    }
    return;
  }

  let filename;
  if (videoPath.includes("/uploads/videos/")) {
    filename = videoPath.split("/uploads/videos/")[1];
  } else if (path.isAbsolute(videoPath)) {
    filename = path.basename(videoPath);
  } else {
    filename = videoPath;
  }

  if (!filename) return;

  const filePath = path.join(videoUploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getLocalImageDir() {
  return imageUploadDir;
}

export function getLocalVideoDir() {
  return videoUploadDir;
}
