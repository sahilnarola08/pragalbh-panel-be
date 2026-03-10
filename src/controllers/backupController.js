import https from "https";
import DatabaseBackup from "../models/databaseBackup.js";
import { sendErrorResponse, sendSuccessResponse } from "../util/commonResponses.js";
import { streamDownloadEncryptedFromDrive, deleteBackupEverywhere } from "../services/backupService.js";

function postGithubWorkflowDispatch({ token, repo, workflowFile, ref, inputs }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ ref, inputs });
    const options = {
      hostname: "api.github.com",
      path: `/repos/${repo}/actions/workflows/${workflowFile}/dispatches`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "pragalbh-backup-runner",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(undefined);
        } else {
          const text = Buffer.concat(chunks).toString("utf8");
          reject(new Error(`GitHub dispatch failed (${res.statusCode}): ${text}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function runBackup(req, res) {
  try {
    const token = process.env.GH_BACKUP_TOKEN;
    const repo = process.env.GH_BACKUP_REPO; // e.g. "owner/repo"
    const workflowFile = process.env.GH_BACKUP_WORKFLOW_BACKUP || "mongodb-backup.yml";
    const ref = process.env.GH_BACKUP_REF || "main";

    if (!token || !repo) {
      return sendErrorResponse({
        res,
        status: 500,
        message: "Backup configuration missing on server (GH_BACKUP_TOKEN / GH_BACKUP_REPO).",
      });
    }

    const initiatedBy = req.user?._id ? String(req.user._id) : "";
    await postGithubWorkflowDispatch({
      token,
      repo,
      workflowFile,
      ref,
      inputs: { type: "MANUAL", initiatedBy },
    });

    return sendSuccessResponse({
      res,
      status: 202,
      message: "Backup started via GitHub Actions.",
      data: {},
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to start backup" });
  }
}

export async function history(req, res) {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = { deletedAt: null };
    if (search && String(search).trim()) {
      filter.fileName = { $regex: String(search).trim(), $options: "i" };
    }

    const [items, totalCount] = await Promise.all([
      DatabaseBackup.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      DatabaseBackup.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Backup history",
      data: { backups: items, totalCount, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalCount / limitNum) },
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to fetch history" });
  }
}

export async function download(req, res) {
  try {
    const { id } = req.params;
    const backup = await DatabaseBackup.findById(id).lean();
    if (!backup || backup.deletedAt) {
      return sendErrorResponse({ res, status: 404, message: "Backup not found" });
    }
    if (!backup.googleDriveFileId) {
      return sendErrorResponse({ res, status: 400, message: "Backup is not available yet" });
    }
    await streamDownloadEncryptedFromDrive({
      driveFileId: backup.googleDriveFileId,
      res,
      fileName: backup.fileName,
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Download failed" });
  }
}

export async function restore(req, res) {
  try {
    const { id } = req.params;
    const backup = await DatabaseBackup.findById(id).lean();
    if (!backup || backup.deletedAt) return sendErrorResponse({ res, status: 404, message: "Backup not found" });
    if (backup.status !== "SUCCESS") return sendErrorResponse({ res, status: 400, message: "Backup is not successful" });

    const token = process.env.GH_BACKUP_TOKEN;
    const repo = process.env.GH_BACKUP_REPO;
    const workflowFile = process.env.GH_BACKUP_WORKFLOW_RESTORE || "mongodb-restore.yml";
    const ref = process.env.GH_BACKUP_REF || "main";

    if (!token || !repo) {
      return sendErrorResponse({
        res,
        status: 500,
        message: "Backup configuration missing on server (GH_BACKUP_TOKEN / GH_BACKUP_REPO).",
      });
    }

    const requestedBy = req.user?._id ? String(req.user._id) : "";
    await postGithubWorkflowDispatch({
      token,
      repo,
      workflowFile,
      ref,
      inputs: { backupId: String(id), requestedBy },
    });

    return sendSuccessResponse({
      res,
      status: 202,
      message: "Restore started via GitHub Actions.",
      data: { restoreRequested: true },
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to start restore" });
  }
}

export async function deleteBackup(req, res) {
  try {
    const { id } = req.params;
    const out = await deleteBackupEverywhere(id);
    return sendSuccessResponse({ res, status: 200, message: "Backup deleted", data: out });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to delete backup" });
  }
}

