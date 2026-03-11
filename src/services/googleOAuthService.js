import { google } from "googleapis";
import mongoose from "mongoose";
import GoogleDriveIntegration from "../models/googleDriveIntegration.js";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

function getOAuth2Client(clientId, clientSecret, redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth login URL. state should include userId so callback can associate tokens.
 */
export function generateGoogleAuthUrl(state) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  const baseUrl = (process.env.BASE_URL || process.env.BACKEND_URL || "http://localhost:8003").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env");
  }

  const oauth2Client = getOAuth2Client(clientId, clientSecret, redirectUri);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: state || "",
  });
  return url;
}

/**
 * Exchange code for tokens and store refresh_token for the user.
 */
export async function handleGoogleCallback(code, state) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  const baseUrl = (process.env.BASE_URL || process.env.BACKEND_URL || "http://localhost:8003").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/google/callback`;

  if (!code || !state) {
    throw new Error("Missing code or state");
  }

  // state is our userId from JWT; cast to ObjectId for consistent storage/query
  const userId = mongoose.Types.ObjectId.isValid(String(state))
    ? new mongoose.Types.ObjectId(String(state))
    : state;
  const oauth2Client = getOAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("No refresh_token returned. User may have already authorized; try revoking access and connecting again.");
  }

  await GoogleDriveIntegration.findOneAndUpdate(
    { userId },
    {
      userId,
      clientId,
      clientSecret,
      refreshToken: tokens.refresh_token,
    },
    { upsert: true, new: true }
  );

  return { success: true };
}

export async function getIntegrationByUserId(userId) {
  const id = mongoose.Types.ObjectId.isValid(String(userId))
    ? new mongoose.Types.ObjectId(String(userId))
    : userId;
  return GoogleDriveIntegration.findOne({ userId: id }).lean();
}
