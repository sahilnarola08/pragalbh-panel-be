import { google } from "googleapis";
import GoogleDriveIntegration from "../models/googleDriveIntegration.js";

/**
 * Get OAuth2-driven Drive client for a user (by userId) or from integration record.
 */
function getDriveClientFromIntegration(integration) {
  if (!integration || !integration.refreshToken) {
    throw new Error("No Google Drive integration or refresh token");
  }
  const clientId = integration.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = integration.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  const baseUrl = (process.env.BASE_URL || process.env.BACKEND_URL || "http://localhost:8003").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/google/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: integration.refreshToken });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Get integration by userId.
 */
export async function getIntegrationByUserId(userId) {
  return GoogleDriveIntegration.findOne({ userId }).lean();
}

/**
 * Get first integration that has refreshToken and folderId (for scheduled backup).
 */
export async function getFirstActiveIntegration() {
  return GoogleDriveIntegration.findOne({
    refreshToken: { $exists: true, $ne: "" },
    folderId: { $exists: true, $ne: "" },
  }).lean();
}

/**
 * Upload a file (stream or path) to the user's Drive folder. Uses OAuth2.
 * @param {Object} options - { userId, folderId, fileName, filePath?, stream?, mimeType }
 * @returns {Promise<{ id, name, webViewLink, webContentLink }>}
 */
export async function uploadBackupFile({ userId, folderId, fileName, filePath, stream, mimeType }) {
  const integration = await GoogleDriveIntegration.findOne({ userId }).lean();
  if (!integration) throw new Error("Google Drive not connected for this user");
  if (!folderId) folderId = integration.folderId;
  if (!folderId) throw new Error("No backup folder set. Set folder in settings.");

  const drive = getDriveClientFromIntegration(integration);
  const body = stream || (filePath ? (await import("fs")).createReadStream(filePath) : null);
  if (!body) throw new Error("Provide filePath or stream");

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/zip",
      body,
    },
    fields: "id,name,webViewLink,webContentLink",
  });

  return res.data;
}

/**
 * Upload backup. If userId is omitted, uses first active integration (for backupService.js / Super Admin flow).
 */
export async function uploadBackupStream({ userId, folderId, fileName, stream, mimeType }) {
  if (!userId) {
    const integration = await getFirstActiveIntegration();
    if (!integration) throw new Error("No Google Drive integration. Connect Drive in settings.");
    return uploadBackupFile({
      userId: integration.userId,
      folderId: folderId || integration.folderId,
      fileName,
      stream,
      mimeType: mimeType || "application/zip",
    });
  }
  return uploadBackupFile({
    userId,
    folderId,
    fileName,
    stream,
    mimeType: mimeType || "application/zip",
  });
}

// --- Compatibility for backupService.js (Super Admin / GitHub Actions flow) ---
// Uses first active OAuth integration so existing encrypted backup flow still works.

async function getDriveClientFirstIntegration() {
  const integration = await getFirstActiveIntegration();
  if (!integration) throw new Error("No Google Drive integration. Connect Drive in settings.");
  return getDriveClientFromIntegration(integration);
}

export async function ensureBackupFolder() {
  const integration = await getFirstActiveIntegration();
  if (!integration?.folderId) throw new Error("No backup folder set. Set folder in Google Drive settings.");
  return integration.folderId;
}

export async function listBackupsInFolder(folderId, { pageSize = 200 } = {}) {
  const drive = await getDriveClientFirstIntegration();
  const q = [`'${folderId}' in parents`, "trashed=false"].join(" and ");
  const res = await drive.files.list({
    q,
    fields: "files(id,name,size,createdTime,webViewLink,webContentLink)",
    orderBy: "createdTime desc",
    pageSize,
  });
  return res.data.files || [];
}

export async function deleteDriveFile(fileId) {
  const drive = await getDriveClientFirstIntegration();
  await drive.files.delete({ fileId });
}

export async function downloadDriveFileStream(fileId) {
  const drive = await getDriveClientFirstIntegration();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data;
}
