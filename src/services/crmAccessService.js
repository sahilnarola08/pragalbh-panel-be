import crypto from "crypto";
import jwt from "jsonwebtoken";
import Auth from "../models/auth.js";
import User from "../models/user.js";
import { secret } from "../config/secret.js";

const tokenSecret = secret?.tokenSecret || process.env.TOKEN_SECRET || "default-secret-key";
const crmBaseUrl = process.env.CRM_APP_URL || secret?.adminUrl || "";

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function sanitizeObjectIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

export async function setCrmAccess(userId, payload, actorId) {
  const user = await Auth.findById(userId);
  if (!user) return null;

  const enabled = payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(user.crmAccess?.enabled);
  const accessMode = payload.accessMode === "all" ? "all" : "selected";
  const allowedCustomerIds = sanitizeObjectIds(payload.allowedCustomerIds);

  if (accessMode === "selected" && allowedCustomerIds.length > 0) {
    const count = await User.countDocuments({
      _id: { $in: allowedCustomerIds },
      isDeleted: false,
    });
    if (count !== allowedCustomerIds.length) {
      const err = new Error("One or more allowedCustomerIds are invalid");
      err.status = 400;
      throw err;
    }
  }

  user.crmAccess = {
    ...((user.crmAccess && user.crmAccess.toObject) ? user.crmAccess.toObject() : user.crmAccess || {}),
    enabled,
    accessMode,
    allowedCustomerIds: accessMode === "all" ? [] : allowedCustomerIds,
    invitedBy: actorId || user.crmAccess?.invitedBy || null,
  };

  await user.save();
  return user;
}

export async function createCrmInvite(userId, actorId, expiresInHours = 48) {
  const user = await Auth.findById(userId);
  if (!user) return null;

  const hours = Math.max(1, Math.min(Number(expiresInHours) || 48, 24 * 30));
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const inviteToken = jwt.sign(
    {
      sub: String(user._id),
      type: "crm_invite",
      email: user.email,
    },
    tokenSecret,
    { expiresIn: `${hours}h` }
  );

  user.crmAccess = {
    ...((user.crmAccess && user.crmAccess.toObject) ? user.crmAccess.toObject() : user.crmAccess || {}),
    enabled: true,
    invitationStatus: "pending",
    invitedAt: new Date(),
    invitedBy: actorId || null,
    inviteTokenHash: hashToken(inviteToken),
    inviteExpiresAt: expiresAt,
    lastInvitedEmail: user.email || "",
  };
  await user.save();

  const inviteUrl = crmBaseUrl
    ? `${crmBaseUrl.replace(/\/+$/, "")}/auth/accept-invite?token=${encodeURIComponent(inviteToken)}`
    : "";

  return {
    inviteToken,
    inviteUrl,
    expiresAt,
  };
}

export function getCrmContract(user, permissions) {
  const crmAccess = user?.crmAccess || {};
  const allowedIds = Array.isArray(crmAccess.allowedCustomerIds)
    ? crmAccess.allowedCustomerIds.map((id) => String(id))
    : [];

  const perms = permissions || [];
  return {
    userId: String(user?._id || ""),
    email: user?.email || "",
    enabled: Boolean(crmAccess.enabled),
    invitationStatus: crmAccess.invitationStatus || "none",
    accessMode: crmAccess.accessMode === "all" ? "all" : "selected",
    allowedCustomerIds: crmAccess.accessMode === "all" ? [] : allowedIds,
    canViewAllLeads: perms.includes("crm.access.manage") || perms.includes("users.manage"),
    tokenSource: "bearer_or_cookie",
    sessionId: user?.sessionId || null,
    permissions: perms,
    lastLoginAt: crmAccess.lastLoginAt || null,
  };
}

export async function markCrmInviteAccepted(userId) {
  await Auth.findByIdAndUpdate(userId, {
    $set: {
      "crmAccess.invitationStatus": "accepted",
      "crmAccess.lastLoginAt": new Date(),
      "crmAccess.inviteTokenHash": null,
      "crmAccess.inviteExpiresAt": null,
    },
  });
}

