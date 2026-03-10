import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import nodemailer from "nodemailer";
import DatabaseBackup from "../models/databaseBackup.js";
import { secret } from "../config/secret.js";
import {
  ensureBackupFolder,
  uploadBackupStream,
  listBackupsInFolder,
  deleteDriveFile,
  downloadDriveFileStream,
} from "./googleDriveBackupService.js";
import { createEncryptStream, createDecryptStream } from "./backupCryptoService.js";

function requireMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
  if (!uri) throw new Error("MONGODB_URI is required for backup/restore");
  return uri;
}

function formatName(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `backup_${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}_${pad(d.getMinutes())}.archive.gz.enc`;
}

function getTransporter() {
  if (!secret.emailService || !secret.emailUser || !secret.emailPass) return null;
  return nodemailer.createTransport({
    service: secret.emailService,
    auth: { user: secret.emailUser, pass: secret.emailPass },
  });
}

async function retentionCleanup(folderId, keep = 30) {
  const files = await listBackupsInFolder(folderId, { pageSize: 200 });
  if (files.length <= keep) return { deleted: 0 };
  const toDelete = files.slice(keep);
  let deleted = 0;
  for (const f of toDelete) {
    if (!f?.id) continue;
    try {
      await deleteDriveFile(f.id);
      deleted += 1;
    } catch {
      // ignore individual delete failures
    }
  }
  return { deleted };
}

async function sendBackupEmail({ subject, html, attachments }) {
  const transporter = getTransporter();
  if (!transporter) return;
  const to = "sahil.pragalbhjewels@gmail.com";
  await transporter.sendMail({
    from: secret.emailUser,
    to,
    subject,
    html,
    attachments: attachments || [],
  });
}

export async function runBackupJob({ backupType, createdBy, backupId }) {
  const mongoUri = requireMongoUri();
  const folderId = await ensureBackupFolder();

  const fileName = formatName(new Date());
  const tmpFile = path.join(os.tmpdir(), fileName);
  const logFile = path.join(os.tmpdir(), `${fileName}.log.txt`);

  const record = backupId
    ? await DatabaseBackup.findById(backupId)
    : await DatabaseBackup.create({
        fileName,
        size: 0,
        googleDriveFileId: "",
        backupType,
        createdBy: createdBy || null,
        status: "IN_PROGRESS",
        logs: logFile,
      });

  if (!record) {
    throw new Error("Backup record not found");
  }

  // Update record to the final computed filename and attach logs path
  record.fileName = fileName;
  record.logs = logFile;
  record.backupType = backupType;
  record.createdBy = createdBy || null;
  record.status = "IN_PROGRESS";
  record.error = "";
  await record.save();

  let stderr = "";
  try {
    const dump = spawn("mongodump", ["--uri", mongoUri, "--archive"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    dump.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      fs.appendFileSync(logFile, s);
    });

    // gzip level 1 = fastest compression (faster backup, slightly larger file)
    const gzipFast = zlib.createGzip({ level: 1 });
    const encrypt = createEncryptStream();
    await pipeline(dump.stdout, gzipFast, encrypt, fs.createWriteStream(tmpFile));

    const exitCode = await new Promise((resolve, reject) => {
      dump.on("error", reject);
      dump.on("close", resolve);
    });
    if (exitCode !== 0) {
      throw new Error(`mongodump failed with exit code ${exitCode}`);
    }

    const stats = fs.statSync(tmpFile);
    const size = stats.size || 0;

    const uploaded = await uploadBackupStream({
      fileName,
      mimeType: "application/octet-stream",
      stream: fs.createReadStream(tmpFile),
      folderId,
    });

    await retentionCleanup(folderId, 30);

    record.size = Number(uploaded.size || size || 0);
    record.googleDriveFileId = uploaded.id || "";
    record.googleDriveWebViewLink = uploaded.webViewLink || "";
    record.googleDriveWebContentLink = uploaded.webContentLink || "";
    record.status = "SUCCESS";
    record.error = "";
    await record.save();

    const createdTime = new Date().toISOString();
    const downloadLink = uploaded.webViewLink || uploaded.webContentLink || "";
    const sizeMB = (record.size / (1024 * 1024)).toFixed(2);

    const attachments =
      record.size > 0 && record.size < 20 * 1024 * 1024
        ? [{ filename: fileName, path: tmpFile }]
        : [];

    await sendBackupEmail({
      subject: backupType === "AUTO" ? "Daily MongoDB Backup Completed" : "MongoDB Backup Completed",
      html: `
        <div>
          <p><strong>Status:</strong> SUCCESS</p>
          <p><strong>Backup Name:</strong> ${fileName}</p>
          <p><strong>Backup Size:</strong> ${sizeMB} MB</p>
          <p><strong>Created Time:</strong> ${createdTime}</p>
          <p><strong>Google Drive Link:</strong> ${downloadLink ? `<a href="${downloadLink}">Open</a>` : "—"}</p>
          <p style="color:#6b7280;font-size:12px;">Backup file is encrypted (AES-256-GCM). Store/download securely.</p>
        </div>
      `,
      attachments,
    });

    return record.toObject();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record.status = "FAILED";
    record.error = msg;
    record.googleDriveFileId = record.googleDriveFileId || "";
    await record.save();

    await sendBackupEmail({
      subject: "MongoDB Backup Failed",
      html: `
        <div>
          <p><strong>Status:</strong> FAILED</p>
          <p><strong>Backup Name:</strong> ${record.fileName}</p>
          <p><strong>Error:</strong> ${msg}</p>
          <pre style="white-space:pre-wrap;max-height:240px;overflow:auto;">${(stderr || "").slice(-5000)}</pre>
        </div>
      `,
    });

    throw e;
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

export async function streamDownloadEncryptedFromDrive({ driveFileId, res, fileName }) {
  const stream = await downloadDriveFileStream(driveFileId);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName || "backup.archive.gz.enc"}"`);
  return pipeline(stream, res);
}

export async function runRestoreJob({ backupId, requestedBy }) {
  const mongoUri = requireMongoUri();
  const backup = await DatabaseBackup.findById(backupId).lean();
  if (!backup) throw new Error("Backup record not found");
  if (backup.status !== "SUCCESS" || !backup.googleDriveFileId) throw new Error("Backup is not restorable");

  // Safety backup before restore (MANUAL type, but annotated in logs)
  await runBackupJob({ backupType: "MANUAL", createdBy: requestedBy || null });

  const encStream = await downloadDriveFileStream(backup.googleDriveFileId);
  const decrypt = createDecryptStream();
  const gunzip = zlib.createGunzip();

  const restore = spawn("mongorestore", ["--uri", mongoUri, "--archive", "--drop"], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  restore.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  await pipeline(encStream, decrypt, gunzip, restore.stdin);
  const exitCode = await new Promise((resolve, reject) => {
    restore.on("error", reject);
    restore.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`mongorestore failed with exit code ${exitCode}. ${stderr.slice(-2000)}`);
  }

  await sendBackupEmail({
    subject: "MongoDB Restore Completed",
    html: `
      <div>
        <p><strong>Status:</strong> SUCCESS</p>
        <p><strong>Restored Backup:</strong> ${backup.fileName}</p>
        <p><strong>Requested By:</strong> ${requestedBy || "system"}</p>
      </div>
    `,
  });
}

export async function deleteBackupEverywhere(backupId) {
  const backup = await DatabaseBackup.findById(backupId);
  if (!backup) throw new Error("Backup not found");
  if (backup.googleDriveFileId) {
    await deleteDriveFile(backup.googleDriveFileId);
  }
  backup.deletedAt = new Date();
  await backup.save();
  return backup.toObject();
}

