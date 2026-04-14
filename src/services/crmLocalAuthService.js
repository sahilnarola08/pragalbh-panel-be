import jwt from "jsonwebtoken";
import crypto from "crypto";
import CrmSession from "../models/crmSession.js";
import CrmRefreshToken from "../models/crmRefreshToken.js";
import { decryptText, encryptText, hashToken } from "./crmCryptoService.js";
import { crmTelemetry } from "./crmTelemetryService.js";

const CRM_ACCESS_TOKEN_TTL_MINUTES = Number(process.env.CRM_ACCESS_TOKEN_TTL_MINUTES || 15);
const CRM_REFRESH_TOKEN_TTL_DAYS = Number(process.env.CRM_REFRESH_TOKEN_TTL_DAYS || 14);
const CRM_SESSION_MAX_INACTIVE_DAYS = Number(process.env.CRM_SESSION_MAX_INACTIVE_DAYS || 30);
const CRM_REFRESH_COOKIE = process.env.CRM_REFRESH_COOKIE_NAME || "crmRefreshToken";
const JWT_SECRET = process.env.CRM_AUTH_JWT_SECRET || process.env.TOKEN_SECRET || "crm-local-secret";
const JWT_ISSUER = "pragalbh-crm-local-auth";

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const buildAccessToken = ({ sessionId, userId, panelUserId, permissions }) =>
  jwt.sign(
    {
      sid: String(sessionId),
      uid: String(userId),
      panelUserId: String(panelUserId),
      permissions: Array.isArray(permissions) ? permissions : [],
      typ: "crm_access",
    },
    JWT_SECRET,
    { expiresIn: `${CRM_ACCESS_TOKEN_TTL_MINUTES}m`, issuer: JWT_ISSUER }
  );

const buildRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const parseTokenOrThrow = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
  } catch (error) {
    throw Object.assign(new Error("Invalid or expired CRM access token"), { status: 401 });
  }
};

const getInactiveExpiry = () => addDays(new Date(), CRM_SESSION_MAX_INACTIVE_DAYS);

const touchSession = async (sessionId) => {
  await CrmSession.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { lastActivityAt: new Date(), expiresAt: getInactiveExpiry() } }
  );
};

export const crmLocalAuthService = {
  getRefreshCookieName() {
    return CRM_REFRESH_COOKIE;
  },

  setRefreshCookie(res, refreshToken) {
    res.cookie(CRM_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: CRM_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  },

  clearRefreshCookie(res) {
    res.cookie(CRM_REFRESH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  },

  verifyAccessToken(token) {
    return parseTokenOrThrow(token);
  },

  async createSessionAndTokens({ panelUser, panelAccessToken, deviceInfo, userAgent, ipAddress }) {
    const now = new Date();
    const session = await CrmSession.create({
      userId: panelUser._id || panelUser.id,
      panelUserId: panelUser._id || panelUser.id,
      panelTokenEncrypted: encryptText(panelAccessToken),
      expiresAt: addDays(now, CRM_SESSION_MAX_INACTIVE_DAYS),
      lastActivityAt: now,
      deviceInfo: String(deviceInfo || ""),
      userAgent: String(userAgent || ""),
      ipAddress: String(ipAddress || ""),
    });

    const refreshTokenRaw = buildRefreshToken();
    await CrmRefreshToken.create({
      tokenHash: hashToken(refreshTokenRaw),
      sessionId: session._id,
      deviceInfo: String(deviceInfo || ""),
      expiresAt: addDays(now, CRM_REFRESH_TOKEN_TTL_DAYS),
    });

    const accessToken = buildAccessToken({
      sessionId: session._id,
      userId: panelUser._id || panelUser.id,
      panelUserId: panelUser._id || panelUser.id,
      permissions: panelUser.permissions || [],
    });

    return { session, accessToken, refreshToken: refreshTokenRaw };
  },

  async getSessionPanelToken(sessionId) {
    const session = await CrmSession.findOne({ _id: sessionId, revokedAt: null });
    if (!session) {
      throw Object.assign(new Error("CRM session not found"), { status: 401 });
    }
    if (session.expiresAt < new Date()) {
      throw Object.assign(new Error("CRM session expired"), { status: 401 });
    }
    return decryptText(session.panelTokenEncrypted);
  },

  async rotateRefreshToken(refreshTokenRaw, permissions = []) {
    const tokenHash = hashToken(refreshTokenRaw);
    const tokenDoc = await CrmRefreshToken.findOne({ tokenHash }).populate("sessionId");

    if (!tokenDoc) {
      crmTelemetry.recordRefresh(false);
      throw Object.assign(new Error("Refresh token is invalid"), { status: 401 });
    }

    if (tokenDoc.revokedAt) {
      crmTelemetry.recordRefreshReuse();
      crmTelemetry.recordRefresh(false);
      await this.revokeSessionFamily(String(tokenDoc.sessionId?._id || tokenDoc.sessionId), "reuse-detected");
      throw Object.assign(new Error("Refresh token reuse detected; session revoked"), {
        status: 401,
      });
    }

    if (tokenDoc.expiresAt < new Date()) {
      await CrmRefreshToken.updateOne(
        { _id: tokenDoc._id },
        { $set: { revokedAt: new Date(), revokeReason: "expired" } }
      );
      crmTelemetry.recordRefresh(false);
      throw Object.assign(new Error("Refresh token expired"), { status: 401 });
    }

    const session = tokenDoc.sessionId;
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      crmTelemetry.recordRefresh(false);
      throw Object.assign(new Error("Session no longer active"), { status: 401 });
    }

    const now = new Date();
    await CrmRefreshToken.updateOne(
      { _id: tokenDoc._id },
      { $set: { revokedAt: now, revokeReason: "rotated", usedAt: now } }
    );

    const nextRefreshRaw = buildRefreshToken();
    await CrmRefreshToken.create({
      tokenHash: hashToken(nextRefreshRaw),
      sessionId: session._id,
      deviceInfo: tokenDoc.deviceInfo || "",
      rotatedFrom: tokenDoc._id,
      expiresAt: addDays(now, CRM_REFRESH_TOKEN_TTL_DAYS),
    });

    await touchSession(session._id);

    const accessToken = buildAccessToken({
      sessionId: session._id,
      userId: session.userId,
      panelUserId: session.panelUserId,
      permissions,
    });

    crmTelemetry.recordRefresh(true);
    return { session, accessToken, refreshToken: nextRefreshRaw };
  },

  async revokeSessionById(sessionId, reason = "logout") {
    const now = new Date();
    await CrmSession.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason } }
    );
    await CrmRefreshToken.updateMany(
      { sessionId, revokedAt: null },
      { $set: { revokedAt: now, revokeReason: reason } }
    );
  },

  async revokeSessionFamily(sessionId, reason = "session-revoked") {
    await this.revokeSessionById(sessionId, reason);
  },

  async revokeAllSessionsForUser(userId, reason = "logout-all") {
    const sessions = await CrmSession.find({ userId, revokedAt: null }).select("_id");
    if (!sessions.length) return;
    const sessionIds = sessions.map((s) => s._id);
    const now = new Date();
    await CrmSession.updateMany(
      { _id: { $in: sessionIds } },
      { $set: { revokedAt: now, revokedReason: reason } }
    );
    await CrmRefreshToken.updateMany(
      { sessionId: { $in: sessionIds }, revokedAt: null },
      { $set: { revokedAt: now, revokeReason: reason } }
    );
  },
};
