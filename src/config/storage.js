const provider = (process.env.STORAGE_PROVIDER || "local").trim().toLowerCase();

export const storageConfig = {
  provider: provider === "supabase" ? "supabase" : "local",
  isSupabase: provider === "supabase",

  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    bucket:
      process.env.SUPABASE_STORAGE_BUCKET ||
      process.env.SUPABASE_STORAGE_BUCKET_IMAGES ||
      "pragalbhjewels",
    buckets: {
      images:
        process.env.SUPABASE_STORAGE_BUCKET_IMAGES ||
        process.env.SUPABASE_STORAGE_BUCKET ||
        "pragalbhjewels",
      videos:
        process.env.SUPABASE_STORAGE_BUCKET_VIDEOS ||
        process.env.SUPABASE_STORAGE_BUCKET ||
        "pragalbhjewels",
    },
    folders: {
      images: (process.env.SUPABASE_STORAGE_FOLDER_IMAGES || "images").replace(/^\/+|\/+$/g, ""),
      videos: (process.env.SUPABASE_STORAGE_FOLDER_VIDEOS || "videos").replace(/^\/+|\/+$/g, ""),
    },
  },

  local: {
    imagesDir: "uploads/images",
    videosDir: "uploads/videos",
  },

  /** Optional quota for dashboard (bytes). Defaults to 1 GB when unset. Set 0 for unlimited display. */
  quotaBytes: (() => {
    const gb = Number(process.env.SUPABASE_STORAGE_QUOTA_GB ?? process.env.STORAGE_QUOTA_GB ?? "1");
    if (!Number.isFinite(gb) || gb <= 0) return null;
    return Math.round(gb * 1024 * 1024 * 1024);
  })(),
};

export function assertSupabaseConfig() {
  const { url, serviceRoleKey } = storageConfig.supabase;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase storage is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env"
    );
  }
}
