import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import Order from "../src/models/order.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SOURCE_BASE_URL = (process.env.MEDIA_SOURCE_BASE_URL || "http://localhost:8003").replace(/\/+$/, "");
const PRODUCTION_API_BASE_URL_RAW = (process.env.PRODUCTION_API_BASE_URL || "").trim();
const PRODUCTION_API_BASE_URL = PRODUCTION_API_BASE_URL_RAW.split(/\s+/)[0]?.replace(/\/+$/, "") || "";
const PRODUCTION_UPLOAD_ENDPOINT = process.env.PRODUCTION_UPLOAD_ENDPOINT || "";
const PRODUCTION_JWT_TOKEN = process.env.PRODUCTION_JWT_TOKEN || "";
const MIGRATION_UPLOAD_KEY = process.env.MIGRATION_UPLOAD_KEY || "";
const LOCAL_UPLOADS_DIR =
  process.env.LOCAL_UPLOADS_DIR || path.resolve(__dirname, "../uploads/images");

const connectDB = async () => {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing DATABASE_URL (or MONGODB_URI/MONGO_URI) in backend .env");
  await mongoose.connect(uri);
};

const getContentTypeByExt = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".avif") return "image/avif";
  return "application/octet-stream";
};

const extractImageFileNameFromUrl = (url) => {
  if (typeof url !== "string" || !url.trim()) return null;
  const trimmed = url.trim();
  let pathname = "";
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    pathname = trimmed;
  }
  const normalizedPath = pathname.replace(/\\/g, "/");
  if (!normalizedPath.includes("/images/")) return null;
  return normalizedPath.split("/images/").pop() || null;
};

const shouldMigrate = (url) => {
  if (typeof url !== "string" || !url.trim()) return false;
  const t = url.trim();
  if (t.startsWith(`${SOURCE_BASE_URL}/images/`)) return true;
  if (t.startsWith("/images/")) return true;
  return false;
};

const uploadLocalFileToProduction = async (filePath, fileName) => {
  const fileBuffer = await fs.promises.readFile(filePath);
  const endpointCandidates = PRODUCTION_UPLOAD_ENDPOINT
    ? [PRODUCTION_UPLOAD_ENDPOINT]
    : [`${PRODUCTION_API_BASE_URL}/upload/images/migrate`, `${PRODUCTION_API_BASE_URL}/upload/images`];

  let lastError = "Upload endpoint not attempted.";
  for (const endpoint of endpointCandidates) {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: getContentTypeByExt(fileName) });
    formData.append("images", blob, fileName);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(PRODUCTION_JWT_TOKEN ? { Authorization: `Bearer ${PRODUCTION_JWT_TOKEN}` } : {}),
        ...(MIGRATION_UPLOAD_KEY ? { "x-migration-key": MIGRATION_UPLOAD_KEY } : {}),
      },
      body: formData,
    });

    if (res.status === 404 && !PRODUCTION_UPLOAD_ENDPOINT) {
      lastError = `Endpoint not found: ${endpoint}`;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload API failed at ${endpoint} (${res.status}): ${text.slice(0, 500)}`);
    }

    const body = await res.json();
    const uploadedUrl = body?.data?.images?.[0]?.url;
    if (!uploadedUrl || typeof uploadedUrl !== "string") {
      throw new Error(`Upload response missing data.images[0].url at ${endpoint}`);
    }
    return uploadedUrl;
  }
  throw new Error(`All upload endpoints failed. Last error: ${lastError}`);
};

const migrateHtmlImageSources = async (html, uploadCache, stats) => {
  if (typeof html !== "string" || !html.trim()) return html || "";
  const srcMatches = Array.from(html.matchAll(/src=(["'])([^"']+)\1/gi));
  if (!srcMatches.length) return html;

  let updatedHtml = html;
  for (const m of srcMatches) {
    const currentUrl = m[2];
    if (!shouldMigrate(currentUrl)) continue;

    let nextUrl = uploadCache.get(currentUrl);
    if (!nextUrl) {
      const fileName = extractImageFileNameFromUrl(currentUrl);
      if (!fileName) {
        stats.htmlSkipNoFileName += 1;
        continue;
      }
      const localPath = path.join(LOCAL_UPLOADS_DIR, fileName);
      if (!fs.existsSync(localPath)) {
        stats.fileMissing += 1;
        continue;
      }
      nextUrl = await uploadLocalFileToProduction(localPath, fileName);
      uploadCache.set(currentUrl, nextUrl);
      stats.uploaded += 1;
    }

    const escaped = currentUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    updatedHtml = updatedHtml.replace(new RegExp(`src=(["'])${escaped}\\1`, "g"), `src="${nextUrl}"`);
    stats.htmlReplaced += 1;
  }
  return updatedHtml;
};

const run = async () => {
  if (!PRODUCTION_API_BASE_URL) {
    throw new Error("Missing PRODUCTION_API_BASE_URL env (example: https://pragalbhpanel.pragalbhjewels.com)");
  }
  if (PRODUCTION_API_BASE_URL_RAW && PRODUCTION_API_BASE_URL_RAW !== PRODUCTION_API_BASE_URL) {
    throw new Error(
      `Invalid PRODUCTION_API_BASE_URL in .env: "${PRODUCTION_API_BASE_URL_RAW}". ` +
        "Looks like multiple env vars are on the same line. Put each env variable on a separate line."
    );
  }
  if (PRODUCTION_UPLOAD_ENDPOINT) {
    try {
      // Validate custom URL early for clearer error than fetch stacktrace.
      new URL(PRODUCTION_UPLOAD_ENDPOINT);
    } catch {
      throw new Error(
        `Invalid PRODUCTION_UPLOAD_ENDPOINT URL: "${PRODUCTION_UPLOAD_ENDPOINT}". ` +
          "Check PRODUCTION_API_BASE_URL and PRODUCTION_UPLOAD_ENDPOINT values in .env."
      );
    }
  }
  if (!PRODUCTION_JWT_TOKEN && !MIGRATION_UPLOAD_KEY) {
    throw new Error("Missing auth: set PRODUCTION_JWT_TOKEN or MIGRATION_UPLOAD_KEY.");
  }
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    throw new Error(`Local uploads dir not found: ${LOCAL_UPLOADS_DIR}`);
  }

  await connectDB();

  const stats = {
    ordersScanned: 0,
    ordersUpdated: 0,
    uploaded: 0,
    productImagesReplaced: 0,
    htmlReplaced: 0,
    fileMissing: 0,
    htmlSkipNoFileName: 0,
  };

  // Cache old URL -> newly uploaded production URL
  const uploadCache = new Map();

  try {
    const cursor = Order.find({}).cursor();
    for (let order = await cursor.next(); order != null; order = await cursor.next()) {
      stats.ordersScanned += 1;
      let changed = false;

      if (Array.isArray(order.products)) {
        for (const product of order.products) {
          if (!Array.isArray(product.productImages)) continue;
          for (const image of product.productImages) {
            const currentUrl = image?.img;
            if (!shouldMigrate(currentUrl)) continue;

            let nextUrl = uploadCache.get(currentUrl);
            if (!nextUrl) {
              const fileName = extractImageFileNameFromUrl(currentUrl);
              if (!fileName) continue;
              const localPath = path.join(LOCAL_UPLOADS_DIR, fileName);
              if (!fs.existsSync(localPath)) {
                stats.fileMissing += 1;
                continue;
              }
              nextUrl = await uploadLocalFileToProduction(localPath, fileName);
              uploadCache.set(currentUrl, nextUrl);
              stats.uploaded += 1;
            }

            if (nextUrl !== currentUrl) {
              image.img = nextUrl;
              changed = true;
              stats.productImagesReplaced += 1;
            }
          }
        }
      }

      if (typeof order.otherDetails === "string" && order.otherDetails.includes("src=")) {
        const migratedHtml = await migrateHtmlImageSources(order.otherDetails, uploadCache, stats);
        if (migratedHtml !== order.otherDetails) {
          order.otherDetails = migratedHtml;
          changed = true;
        }
      }

      if (changed) {
        await order.save();
        stats.ordersUpdated += 1;
      }
    }

    console.log("Migration complete.");
    console.log(`Orders scanned: ${stats.ordersScanned}`);
    console.log(`Orders updated: ${stats.ordersUpdated}`);
    console.log(`Unique files uploaded to production: ${stats.uploaded}`);
    console.log(`Product image URLs replaced: ${stats.productImagesReplaced}`);
    console.log(`OtherDetails image URLs replaced: ${stats.htmlReplaced}`);
    console.log(`Local file missing count: ${stats.fileMissing}`);
    console.log(`HTML src skipped (no /images filename): ${stats.htmlSkipNoFileName}`);
    console.log(`Source base URL: ${SOURCE_BASE_URL}`);
    console.log(`Production API endpoint: ${PRODUCTION_UPLOAD_ENDPOINT}`);
    console.log(`Local uploads directory: ${LOCAL_UPLOADS_DIR}`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
