import { storageConfig } from "../../config/storage.js";
import { getPublicUrl, isSupabasePublicUrl } from "./supabaseStorageService.js";

const LEGACY_IMAGE_PATH = /\/images\/([^?#"'\\s]+)/i;
const LEGACY_UPLOADS_IMAGE_PATH = /\/uploads\/images\/([^?#"'\\s]+)/i;
const LEGACY_VIDEO_PATH = /\/uploads\/videos\/([^?#"'\\s]+)/i;

function joinObjectPath(folder, filename) {
  const cleanFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
}

export function extractLegacyImageFilename(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(LEGACY_IMAGE_PATH) || url.match(LEGACY_UPLOADS_IMAGE_PATH);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function extractLegacyVideoFilename(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(LEGACY_VIDEO_PATH);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function buildSupabaseImageUrl(filename) {
  const bucket = storageConfig.supabase.buckets.images;
  const objectPath = joinObjectPath(storageConfig.supabase.folders.images, filename);
  return getPublicUrl(bucket, objectPath);
}

export function buildSupabaseVideoUrl(filename) {
  const bucket = storageConfig.supabase.buckets.videos;
  const objectPath = joinObjectPath(storageConfig.supabase.folders.videos, filename);
  return getPublicUrl(bucket, objectPath);
}

export function isLegacyMediaUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (isSupabasePublicUrl(url)) return false;
  if (url.includes("placehold.co")) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  return Boolean(extractLegacyImageFilename(url) || extractLegacyVideoFilename(url));
}

export function migrateMediaUrl(url) {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!trimmed || isSupabasePublicUrl(trimmed) || trimmed.includes("placehold.co")) {
    return trimmed;
  }

  const imageFilename = extractLegacyImageFilename(trimmed);
  if (imageFilename) {
    return buildSupabaseImageUrl(imageFilename);
  }

  const videoFilename = extractLegacyVideoFilename(trimmed);
  if (videoFilename) {
    return buildSupabaseVideoUrl(videoFilename);
  }

  return trimmed;
}

export function migrateHtmlMediaUrls(html) {
  if (!html || typeof html !== "string") return html;

  return html.replace(/src=(["'])([^"']+)\1/gi, (full, quote, src) => {
    const migrated = migrateMediaUrl(src);
    return migrated === src ? full : `src=${quote}${migrated}${quote}`;
  });
}
