import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "../../uploads");
const imageDir = path.join(uploadsDir, "images");
const videoDir = path.join(uploadsDir, "videos");

const IMAGE_EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const VIDEO_EXT_BY_MIME = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
};

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/i;

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const sanitizeBaseName = (name) =>
  String(name || "media")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "media";

const getMediaKindFromMime = (mime) => {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
};

const decodeDataUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return null;
  const mime = String(match[1] || "").toLowerCase();
  const kind = getMediaKindFromMime(mime);
  if (!kind) return null;
  const payload = String(match[2] || "").replace(/\s+/g, "");
  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) return null;
  return { mime, kind, buffer };
};

export const saveDataUrlToServer = async (dataUrl, opts = {}) => {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const { mime, kind, buffer } = decoded;

  if (kind === "image") ensureDir(imageDir);
  else ensureDir(videoDir);

  const extMap = kind === "image" ? IMAGE_EXT_BY_MIME : VIDEO_EXT_BY_MIME;
  const ext = extMap[mime] || (kind === "image" ? "jpg" : "mp4");
  const base = sanitizeBaseName(opts.baseName || kind);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${base}.${ext}`;
  const targetDir = kind === "image" ? imageDir : videoDir;
  const absPath = path.join(targetDir, filename);
  await fs.promises.writeFile(absPath, buffer);
  return kind === "image" ? `/images/${filename}` : `/uploads/videos/${filename}`;
};

export const normalizeMediaRefToServerPath = async (value, opts = {}) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/images/") || trimmed.startsWith("/uploads/")) return trimmed;
  const saved = await saveDataUrlToServer(trimmed, opts);
  if (saved) return saved;
  return trimmed;
};

export const normalizeRichTextMediaHtml = async (html, opts = {}) => {
  if (typeof html !== "string" || !html.trim()) return html || "";
  let updated = html;
  const matches = Array.from(updated.matchAll(/src=(["'])(data:[^"']+)\1/gi));
  for (const match of matches) {
    const whole = match[0];
    const dataUrl = match[2];
    const saved = await saveDataUrlToServer(dataUrl, {
      baseName: opts.baseName || "order-note",
    });
    if (saved) {
      const escapedDataUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const replaceRe = new RegExp(`src=(["'])${escapedDataUrl}\\1`, "i");
      updated = updated.replace(replaceRe, `src="${saved}"`);
    }
  }
  return updated;
};
