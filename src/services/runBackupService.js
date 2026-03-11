import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { getFirstActiveIntegration, getIntegrationByUserId, uploadBackupFile } from "./googleDriveBackupService.js";

function getMongoUri() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    "";
  if (!uri || !uri.trim()) throw new Error("MONGODB_URI or DATABASE_URL required");
  return uri.trim();
}

function getBackupsDir() {
  return path.join(process.cwd(), "backups");
}

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function getMongodumpCommand() {
  const envPath = process.env.MONGODUMP_PATH;
  if (envPath && typeof envPath === "string" && envPath.trim()) return envPath.trim();
  return "mongodump";
}

function runMongodump(uri, outDir) {
  return new Promise((resolve, reject) => {
    const cmd = getMongodumpCommand();
    const proc = spawn(cmd, ["--uri", uri, "--out", outDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`mongodump exited ${code}\n${stderr}`));
      else resolve();
    });
  });
}

function zipFolderWithArchiver(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Run full backup: mongodump -> zip (archiver) -> upload to Drive -> delete zip and dump.
 * @param {string|null} userId - If provided, use this user's integration; else use first active.
 */
export async function runBackup(userId = null) {
  const uri = getMongoUri();
  const backupsDir = getBackupsDir();
  const ts = getTimestamp();
  const folderName = `mongodb-backup-${ts}`;
  const dumpDir = path.join(backupsDir, folderName);
  const zipName = `${folderName}.zip`;
  const zipPath = path.join(backupsDir, zipName);

  let integration;
  if (userId) {
    integration = await getIntegrationByUserId(userId);
  } else {
    integration = await getFirstActiveIntegration();
  }

  if (!integration || !integration.refreshToken) {
    throw new Error("No Google Drive connected. Connect Drive and set folder in settings.");
  }
  if (!integration.folderId) {
    throw new Error("No backup folder set. Set folder in Google Drive settings.");
  }

  const effectiveUserId = integration.userId;

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  console.log("[Backup] Running mongodump");
  await runMongodump(uri, dumpDir);

  console.log("[Backup] Creating zip");
  await zipFolderWithArchiver(dumpDir, zipPath);

  console.log("[Backup] Uploading to Google Drive");
  const uploaded = await uploadBackupFile({
    userId: effectiveUserId,
    folderId: integration.folderId,
    fileName: zipName,
    filePath: zipPath,
    mimeType: "application/zip",
  });

  console.log("[Backup] Upload successful");
  console.log("[Backup] Cleaning temporary files");
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(dumpDir)) fs.rmSync(dumpDir, { recursive: true });
  } catch (e) {
    console.warn("[Backup] Cleanup warning:", e.message);
  }

  console.log("[Backup] Backup completed");
  return { webViewLink: uploaded.webViewLink, webContentLink: uploaded.webContentLink, name: uploaded.name };
}
