import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { assertSupabaseConfig, storageConfig } from "../../config/storage.js";

let client = null;

function getClient() {
  if (!client) {
    assertSupabaseConfig();
    client = createClient(storageConfig.supabase.url, storageConfig.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return client;
}

export function getPublicUrl(bucket, objectPath) {
  const { data } = getClient().storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl || null;
}

export function isSupabasePublicUrl(url) {
  if (!url || typeof url !== "string") return false;
  const base = storageConfig.supabase.url.replace(/\/$/, "");
  return url.startsWith(`${base}/storage/v1/object/public/`);
}

export function parseSupabasePublicUrl(url) {
  if (!isSupabasePublicUrl(url)) return null;
  const prefix = `${storageConfig.supabase.url.replace(/\/$/, "")}/storage/v1/object/public/`;
  const rest = url.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: rest.slice(0, slash),
    objectPath: rest.slice(slash + 1),
  };
}

export async function uploadBuffer({ bucket, objectPath, buffer, contentType, upsert = false }) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType,
    upsert,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(error.message || "Supabase upload failed");
  }

  return getPublicUrl(bucket, objectPath);
}

export async function deleteObject({ bucket, objectPath }) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) {
    throw new Error(error.message || "Supabase delete failed");
  }
}

export async function listObjects(bucket, folder = "") {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    throw new Error(error.message || "Supabase list failed");
  }
  return data || [];
}

function isStorageFolder(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.id == null && !entry.metadata) return true;
  return typeof entry.metadata?.size !== "number";
}

/**
 * Recursively sum file sizes and count files under a bucket prefix.
 */
export async function getFolderUsage(bucket, folder = "") {
  const supabase = getClient();
  let totalBytes = 0;
  let fileCount = 0;
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message || "Supabase list failed");
    }
    if (!data?.length) break;

    for (const entry of data) {
      if (entry.name?.startsWith(".")) continue;

      if (isStorageFolder(entry)) {
        const childPrefix = folder ? `${folder}/${entry.name}` : entry.name;
        const nested = await getFolderUsage(bucket, childPrefix);
        totalBytes += nested.totalBytes;
        fileCount += nested.fileCount;
        continue;
      }
      fileCount += 1;
      totalBytes += Number(entry.metadata?.size) || 0;
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return { totalBytes, fileCount };
}
