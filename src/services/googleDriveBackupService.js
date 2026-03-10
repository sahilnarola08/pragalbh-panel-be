import { google } from "googleapis";

const DRIVE_FOLDER_NAME = "CRM_DATABASE_BACKUPS";

function getDriveAuth() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || "";
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY || "";
  // private key in env often has \n escaped
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;

  if (!clientEmail || !privateKey) {
    throw new Error("Google Drive credentials missing (GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY)");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function driveClient() {
  const auth = getDriveAuth();
  return google.drive({ version: "v3", auth });
}

export async function ensureBackupFolder() {
  const drive = driveClient();
  const q = [
    `name='${DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
  ].join(" and ");

  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 10,
  });

  const existing = (list.data.files || [])[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  if (!created.data.id) throw new Error("Failed to create Drive folder");
  return created.data.id;
}

export async function uploadBackupStream({ fileName, mimeType, stream, folderId }) {
  const drive = driveClient();
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: stream,
    },
    fields: "id,name,size,createdTime,webViewLink,webContentLink",
  });
  return res.data;
}

export async function deleteDriveFile(fileId) {
  const drive = driveClient();
  await drive.files.delete({ fileId });
}

export async function listBackupsInFolder(folderId, { pageSize = 200 } = {}) {
  const drive = driveClient();
  const q = [`'${folderId}' in parents`, "trashed=false"].join(" and ");
  const res = await drive.files.list({
    q,
    fields: "files(id,name,size,createdTime,webViewLink,webContentLink)",
    orderBy: "createdTime desc",
    pageSize,
    spaces: "drive",
  });
  return res.data.files || [];
}

export async function downloadDriveFileStream(fileId) {
  const drive = driveClient();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data; // stream
}

