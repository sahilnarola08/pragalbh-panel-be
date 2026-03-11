import { generateGoogleAuthUrl, handleGoogleCallback, getIntegrationByUserId } from "../services/googleOAuthService.js";
import GoogleDriveIntegration from "../models/googleDriveIntegration.js";
import { sendErrorResponse, sendSuccessResponse } from "../util/commonResponses.js";

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.ADMIN_URL || "http://localhost:3000").replace(/\/$/, "");


export function getAuthUrl(req, res) {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) return sendErrorResponse({ res, status: 401, message: "Unauthorized" });
    const url = generateGoogleAuthUrl(userId);
    return sendSuccessResponse({ res, data: { url }, message: "OK" });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to generate auth URL" });
  }
}

export async function callback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/settings/google-drive?error=missing_code_or_state`);
    }
    await handleGoogleCallback(code, state);
    return res.redirect(`${FRONTEND_URL}/settings/google-drive?connected=1`);
  } catch (e) {
    console.error("[Google Drive callback]", e);
    return res.redirect(`${FRONTEND_URL}/settings/google-drive?error=${encodeURIComponent(e?.message || "Callback failed")}`);
  }
}

export async function setFolder(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return sendErrorResponse({ res, status: 401, message: "Unauthorized" });
    const { folderId } = req.body || {};
    let id = (folderId || "").trim();
    if (!id) return sendErrorResponse({ res, status: 400, message: "folderId required" });
    const match = id.match(/[/]folders[/]([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    const existing = await GoogleDriveIntegration.findOne({ userId });
    if (!existing) return sendErrorResponse({ res, status: 400, message: "Connect Google Drive first" });
    existing.folderId = id;
    await existing.save();
    return sendSuccessResponse({ res, data: { folderId: id }, message: "Folder saved" });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to set folder" });
  }
}

export async function status(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return sendErrorResponse({ res, status: 401, message: "Unauthorized" });
    const integration = await getIntegrationByUserId(userId);
    const connected = !!(integration && integration.refreshToken);
    return sendSuccessResponse({
      res,
      data: {
        connected,
        folderId: integration?.folderId || "",
      },
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Failed to get status" });
  }
}
