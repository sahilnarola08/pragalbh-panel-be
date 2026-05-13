import mongoose from "mongoose";
import MessagingIntegration from "../models/messagingIntegration.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../util/commonResponses.js";
import {
  sendWhatsAppText,
  sendTelegramText,
} from "../services/messagingService.js";
import {
  encrypt,
  decrypt,
  isEncryptionAvailable,
} from "../util/crypto.js";
import {
  sendLoginCode,
  verifyLoginCode,
  disconnectClient,
} from "../services/telegramUserService.js";
import {
  createTransporterFromEmailIntegration,
  getFromAddressForEmailIntegration,
  getReplyToForEmailIntegration,
} from "../services/emailSmtpIntegrationService.js";

const SUPPORTED_TYPES = ["whatsapp", "telegram", "sms", "email", "other"];

const TELEGRAM_PLACEHOLDER = "********";

const SMTP_PASSWORD_PLACEHOLDER = "********";

const isHexId = (v) => /^[a-f\d]{24}$/i.test(String(v || ""));

const sanitizeIntegrationPayload = (body = {}, { existing = null } = {}) => {
  const {
    type,
    name,
    provider,
    apiBase,
    accessToken,
    deviceId,
    senderIdentifier,
    platforms,
    isDefault,
    isActive,
    description,
    extra,
    telegram,
    emailSmtp,
  } = body || {};

  const cleaned = {};

  if (type !== undefined) {
    if (!SUPPORTED_TYPES.includes(String(type))) {
      throw new Error(
        `Unsupported integration type. Allowed: ${SUPPORTED_TYPES.join(", ")}`,
      );
    }
    cleaned.type = type;
  }
  if (name !== undefined) {
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Name is required.");
    cleaned.name = trimmed;
  }
  if (provider !== undefined) cleaned.provider = String(provider || "").trim();
  if (apiBase !== undefined) cleaned.apiBase = String(apiBase || "").trim();
  if (accessToken !== undefined)
    cleaned.accessToken = String(accessToken || "").trim();
  if (deviceId !== undefined) cleaned.deviceId = String(deviceId || "").trim();
  if (senderIdentifier !== undefined)
    cleaned.senderIdentifier = String(senderIdentifier || "").trim();
  if (description !== undefined)
    cleaned.description = String(description || "").trim();
  if (typeof isDefault === "boolean") cleaned.isDefault = isDefault;
  if (typeof isActive === "boolean") cleaned.isActive = isActive;

  if (Array.isArray(platforms)) {
    cleaned.platforms = platforms
      .map((p) => String(p || "").trim())
      .filter((p) => isHexId(p));
  }

  if (extra !== undefined && extra !== null && typeof extra === "object") {
    cleaned.extra = extra;
  }

  if (telegram && typeof telegram === "object") {
    if (!isEncryptionAvailable()) {
      throw new Error(
        "MESSAGING_ENCRYPTION_KEY is not set on the server. Cannot save Telegram credentials.",
      );
    }
    const tg = {};
    if (telegram.apiId !== undefined) {
      const n = Number(telegram.apiId);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error("telegram.apiId must be a positive number.");
      }
      tg.apiId = n;
    }
    if (telegram.apiHash !== undefined) {
      const raw = String(telegram.apiHash || "").trim();
      // Empty on update means "keep existing".
      if (raw && raw !== TELEGRAM_PLACEHOLDER) {
        tg.apiHash = encrypt(raw);
      }
    }
    if (telegram.phoneNumber !== undefined) {
      tg.phoneNumber = String(telegram.phoneNumber || "").trim();
    }
    if (telegram.twoFactorPassword !== undefined) {
      const raw = String(telegram.twoFactorPassword || "").trim();
      if (raw && raw !== TELEGRAM_PLACEHOLDER) {
        tg.twoFactorPassword = encrypt(raw);
      } else if (raw === "") {
        // Explicit empty string clears the saved password.
        tg.twoFactorPassword = "";
      }
    }
    // Never accept sessionString / connected directly from the UI; those are
    // managed via the connect/verify flow.
    if (Object.keys(tg).length > 0) cleaned.telegram = tg;
  }

  if (emailSmtp && typeof emailSmtp === "object") {
    if (!isEncryptionAvailable()) {
      throw new Error(
        "MESSAGING_ENCRYPTION_KEY is not set on the server. Cannot save SMTP passwords.",
      );
    }
    const sm = {};
    if (emailSmtp.host !== undefined) {
      sm.host = String(emailSmtp.host || "").trim();
    }
    if (emailSmtp.port !== undefined) {
      const p = parseInt(String(emailSmtp.port), 10);
      sm.port =
        Number.isFinite(p) && p > 0 && p <= 65535 ? p : 587;
    }
    if (emailSmtp.secure !== undefined) sm.secure = Boolean(emailSmtp.secure);
    if (emailSmtp.authUser !== undefined) {
      sm.authUser = String(emailSmtp.authUser || "").trim();
    }
    if (emailSmtp.authPassword !== undefined) {
      const raw = String(emailSmtp.authPassword || "").trim();
      if (raw && raw !== SMTP_PASSWORD_PLACEHOLDER) {
        sm.authPassword = encrypt(raw);
      }
    }
    if (emailSmtp.fromEmail !== undefined) {
      sm.fromEmail = String(emailSmtp.fromEmail || "").trim();
    }
    if (emailSmtp.fromName !== undefined) {
      sm.fromName = String(emailSmtp.fromName || "").trim();
    }
    if (emailSmtp.replyTo !== undefined) {
      sm.replyTo = String(emailSmtp.replyTo || "").trim();
    }
    if (Object.keys(sm).length > 0) cleaned.emailSmtp = sm;
  }

  return cleaned;
};

const applyEmailSmtpPatch = (existing, patch) => {
  if (!patch) return;
  existing.emailSmtp = existing.emailSmtp || {};
  for (const [k, v] of Object.entries(patch)) {
    existing.emailSmtp[k] = v;
  }
  existing.markModified("emailSmtp");
};

/** When marking an integration as default, unset the default on its peers (same type). */
const ensureSingleDefaultPerType = async (
  type,
  keepId,
  session = undefined,
) => {
  const filter = { type, isDefault: true, _id: { $ne: keepId } };
  if (session) {
    return MessagingIntegration.updateMany(
      filter,
      { $set: { isDefault: false } },
      { session },
    );
  }
  return MessagingIntegration.updateMany(filter, {
    $set: { isDefault: false },
  });
};

/**
 * Build a sanitized response payload that NEVER leaks plaintext secrets.
 * - WhatsApp accessToken → masked (first/last 4 visible).
 * - Telegram apiHash / sessionString / twoFactorPassword → replaced with a
 *   placeholder if set, empty if not.
 */
const maskedView = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (obj.accessToken) {
    const token = String(obj.accessToken);
    obj.accessTokenMasked =
      token.length > 8
        ? `${token.slice(0, 4)}…${token.slice(-4)}`
        : "********";
    delete obj.accessToken;
  }
  if (obj.telegram) {
    const tg = obj.telegram || {};
    obj.telegram = {
      apiId: tg.apiId || null,
      phoneNumber: tg.phoneNumber || "",
      connected: Boolean(tg.connected),
      lastConnectedAt: tg.lastConnectedAt || null,
      hasApiHash: Boolean(tg.apiHash),
      hasSession: Boolean(tg.sessionString),
      hasTwoFactor: Boolean(tg.twoFactorPassword),
    };
  }
  if (obj.emailSmtp) {
    const es = obj.emailSmtp || {};
    obj.emailSmtp = {
      host: es.host || "",
      port: Number(es.port) || 587,
      secure: Boolean(es.secure),
      authUser: es.authUser || "",
      fromEmail: es.fromEmail || "",
      fromName: es.fromName || "",
      replyTo: es.replyTo || "",
      hasPassword: Boolean(es.authPassword),
    };
  }
  return obj;
};

const findIntegrationOr404 = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return { error: { status: 400, message: "Invalid id." } };
  }
  const doc = await MessagingIntegration.findOne({
    _id: id,
    isDeleted: false,
  });
  if (!doc) {
    return { error: { status: 404, message: "Integration not found." } };
  }
  return { doc };
};

const messagingIntegrationController = {
  list: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 25,
        type,
        search,
        includeInactive,
      } = req.query || {};

      const filter = { isDeleted: false };
      if (type && SUPPORTED_TYPES.includes(String(type))) filter.type = type;
      if (!includeInactive || includeInactive === "false")
        filter.isActive = true;
      if (search) {
        const q = String(search).trim();
        if (q) {
          filter.$or = [
            { name: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
            { provider: { $regex: q, $options: "i" } },
          ];
        }
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

      const [items, totalCount] = await Promise.all([
        MessagingIntegration.find(filter)
          .sort({ isDefault: -1, createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .populate({ path: "platforms", select: "_id name" })
          .lean(),
        MessagingIntegration.countDocuments(filter),
      ]);

      return sendSuccessResponse({
        res,
        status: 200,
        message: "Messaging integrations fetched.",
        data: {
          integrations: items.map(maskedView),
          totalCount,
          page: pageNum,
          limit: limitNum,
        },
      });
    } catch (error) {
      console.error("Error listing messaging integrations:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to list integrations.",
      });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Invalid id.",
        });
      }
      const item = await MessagingIntegration.findOne({
        _id: id,
        isDeleted: false,
      })
        .populate({ path: "platforms", select: "_id name" })
        .lean();
      if (!item) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Integration not found.",
        });
      }
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Integration fetched.",
        data: maskedView(item),
      });
    } catch (error) {
      console.error("Error getting integration:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to fetch integration.",
      });
    }
  },

  create: async (req, res) => {
    try {
      const payload = sanitizeIntegrationPayload(req.body);
      if (!payload.type) throw new Error("Type is required.");
      if (!payload.name) throw new Error("Name is required.");
      if (payload.type === "email") {
        const es = payload.emailSmtp;
        if (!es?.host) {
          throw new Error("emailSmtp.host is required for email integrations.");
        }
        if (!es?.authUser) {
          throw new Error("emailSmtp.authUser (SMTP username) is required.");
        }
        if (!es?.authPassword) {
          throw new Error("emailSmtp.authPassword (SMTP password) is required.");
        }
      }

      const created = await MessagingIntegration.create(payload);
      if (created.isDefault) {
        await ensureSingleDefaultPerType(created.type, created._id);
      }
      const populated = await MessagingIntegration.findById(created._id)
        .populate({ path: "platforms", select: "_id name" })
        .lean();
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Integration created.",
        data: maskedView(populated),
      });
    } catch (error) {
      console.error("Error creating integration:", error);
      return sendErrorResponse({
        res,
        status: 400,
        message: error?.message || "Failed to create integration.",
      });
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params;
      const found = await findIntegrationOr404(id);
      if (found.error) {
        return sendErrorResponse({
          res,
          status: found.error.status,
          message: found.error.message,
        });
      }
      const existing = found.doc;
      const payload = sanitizeIntegrationPayload(req.body, { existing });

      // Preserve WhatsApp access token when omitted/empty on edit.
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, "accessToken") &&
        !payload.accessToken
      ) {
        delete payload.accessToken;
      }

      // Pop telegram patch — applied separately to preserve other tg fields.
      const telegramPatch = payload.telegram;
      delete payload.telegram;

      const emailSmtpPatch = payload.emailSmtp;
      delete payload.emailSmtp;

      Object.assign(existing, payload);
      if (telegramPatch) applyTelegramPatch(existing, telegramPatch);
      if (emailSmtpPatch) applyEmailSmtpPatch(existing, emailSmtpPatch);

      // If the user changed apiId or apiHash, any previously-saved session is
      // no longer valid for the new credentials — force re-connect.
      if (
        telegramPatch &&
        (telegramPatch.apiId !== undefined ||
          telegramPatch.apiHash !== undefined) &&
        existing.telegram?.sessionString
      ) {
        existing.telegram.sessionString = "";
        existing.telegram.connected = false;
        existing.markModified("telegram");
      }

      await existing.save();

      if (existing.isDefault) {
        await ensureSingleDefaultPerType(existing.type, existing._id);
      }

      const populated = await MessagingIntegration.findById(existing._id)
        .populate({ path: "platforms", select: "_id name" })
        .lean();
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Integration updated.",
        data: maskedView(populated),
      });
    } catch (error) {
      console.error("Error updating integration:", error);
      return sendErrorResponse({
        res,
        status: 400,
        message: error?.message || "Failed to update integration.",
      });
    }
  },

  remove: async (req, res) => {
    try {
      const { id } = req.params;
      const found = await findIntegrationOr404(id);
      if (found.error) {
        return sendErrorResponse({
          res,
          status: found.error.status,
          message: found.error.message,
        });
      }
      const existing = found.doc;
      existing.isDeleted = true;
      existing.isActive = false;
      existing.isDefault = false;
      await existing.save();
      // Best-effort: cleanly close any cached Telegram client.
      try {
        await disconnectClient(existing._id);
      } catch {
        /* ignore */
      }
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Integration deleted.",
        data: { _id: existing._id },
      });
    } catch (error) {
      console.error("Error deleting integration:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to delete integration.",
      });
    }
  },

  /** Send a test message using the saved integration's credentials. */
  sendTest: async (req, res) => {
    try {
      const { id } = req.params;
      const { number, message, telegramUsername, contactNumber } =
        req.body || {};
      if (!mongoose.isValidObjectId(id)) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Invalid id.",
        });
      }
      const integration = await MessagingIntegration.findOne({
        _id: id,
        isDeleted: false,
      }).lean();
      if (!integration) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Integration not found.",
        });
      }

      const finalMessage =
        typeof message === "string" && message.trim()
          ? message.trim()
          : `Test message from ${integration.name}.`;

      if (integration.type === "whatsapp") {
        const { ok, status, body } = await sendWhatsAppText({
          number,
          message: finalMessage,
          integration,
        });
        if (!ok) {
          return sendErrorResponse({
            res,
            status,
            message:
              body?.message ||
              `Upstream provider responded with status ${status}`,
            error: body,
          });
        }
        return sendSuccessResponse({
          res,
          status: 200,
          message: "Test message sent.",
          data: { integrationId: integration._id, provider: body },
        });
      }

      if (integration.type === "telegram") {
        const { ok, status, body } = await sendTelegramText({
          telegramUsername: telegramUsername || "",
          contactNumber: contactNumber || number || "",
          message: finalMessage,
          integration,
        });
        if (!ok) {
          return sendErrorResponse({
            res,
            status,
            message: body?.message || `Telegram send failed (${status}).`,
            error: body,
          });
        }
        return sendSuccessResponse({
          res,
          status: 200,
          message: "Telegram test message sent.",
          data: { integrationId: integration._id, provider: body },
        });
      }

      if (integration.type === "email") {
        const { to, email: toAlt } = req.body || {};
        const dest = String(to || toAlt || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
          return sendErrorResponse({
            res,
            status: 400,
            message:
              "Provide a valid recipient address in the `to` (or `email`) field.",
          });
        }
        const transport = createTransporterFromEmailIntegration(integration);
        if (!transport) {
          return sendErrorResponse({
            res,
            status: 400,
            message:
              "This integration's SMTP is incomplete or the password could not be decrypted. Check host, SMTP user, password, and MESSAGING_ENCRYPTION_KEY.",
          });
        }
        const fromAddr =
          getFromAddressForEmailIntegration(integration) ||
          integration.emailSmtp?.authUser?.trim();
        if (!fromAddr) {
          return sendErrorResponse({
            res,
            status: 400,
            message:
              "Set From email (or SMTP user) on this integration before testing.",
          });
        }
        const replyTo = getReplyToForEmailIntegration(integration);
        const safeHtml = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${String(
          finalMessage,
        )
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`;
        await transport.sendMail({
          from: fromAddr,
          to: dest,
          subject: `Test — ${integration.name}`,
          text: finalMessage,
          html: safeHtml,
          ...(replyTo ? { replyTo } : {}),
        });
        return sendSuccessResponse({
          res,
          status: 200,
          message: "Test email sent.",
          data: { integrationId: integration._id, to: dest },
        });
      }

      return sendErrorResponse({
        res,
        status: 400,
        message: `Test send is not yet implemented for integration type: ${integration.type}.`,
      });
    } catch (error) {
      console.error("Error testing integration:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to send test message.",
      });
    }
  },

  /**
   * Telegram OTP step 1 — sends the verification code to the admin's phone.
   * Body: {} (uses apiId / apiHash / phoneNumber stored on the integration)
   */
  telegramSendCode: async (req, res) => {
    try {
      const { id } = req.params;
      const found = await findIntegrationOr404(id);
      if (found.error) {
        return sendErrorResponse({
          res,
          status: found.error.status,
          message: found.error.message,
        });
      }
      const integration = found.doc;
      if (integration.type !== "telegram") {
        return sendErrorResponse({
          res,
          status: 400,
          message: "This endpoint only works for telegram integrations.",
        });
      }
      if (!isEncryptionAvailable()) {
        return sendErrorResponse({
          res,
          status: 500,
          message:
            "MESSAGING_ENCRYPTION_KEY is not configured. Cannot decrypt Telegram credentials.",
        });
      }
      const apiId = integration.telegram?.apiId;
      if (!apiId) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Set telegram.apiId on the integration first.",
        });
      }
      let apiHash;
      try {
        apiHash = decrypt(integration.telegram?.apiHash);
      } catch (err) {
        return sendErrorResponse({
          res,
          status: 500,
          message: `Could not decrypt apiHash: ${err.message}`,
        });
      }
      if (!apiHash) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Set telegram.apiHash on the integration first.",
        });
      }
      const phoneNumber = integration.telegram?.phoneNumber;
      if (!phoneNumber) {
        return sendErrorResponse({
          res,
          status: 400,
          message:
            "Set telegram.phoneNumber on the integration first (include country code, e.g. +91...).",
        });
      }

      const result = await sendLoginCode({
        integrationId: integration._id,
        apiId,
        apiHash,
        phoneNumber,
      });
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Verification code sent. Check your Telegram app.",
        data: {
          phoneCodeHashSent: Boolean(result.phoneCodeHash),
          phoneNumber,
        },
      });
    } catch (error) {
      console.error("Telegram send-code error:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to send Telegram login code.",
      });
    }
  },

  /**
   * Telegram OTP step 2 — verifies code (and 2FA password if needed).
   * Body: { phoneCode, password? }
   */
  telegramVerifyCode: async (req, res) => {
    try {
      const { id } = req.params;
      const { phoneCode, password } = req.body || {};
      const found = await findIntegrationOr404(id);
      if (found.error) {
        return sendErrorResponse({
          res,
          status: found.error.status,
          message: found.error.message,
        });
      }
      const integration = found.doc;
      if (integration.type !== "telegram") {
        return sendErrorResponse({
          res,
          status: 400,
          message: "This endpoint only works for telegram integrations.",
        });
      }
      if (!phoneCode) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "phoneCode is required.",
        });
      }

      // Resolve 2FA password: explicit body password wins; else fall back to
      // the one saved on the integration (if any).
      let pwd = password ? String(password) : "";
      if (!pwd && integration.telegram?.twoFactorPassword) {
        try {
          pwd = decrypt(integration.telegram.twoFactorPassword);
        } catch {
          /* ignore — fall through and let GramJS prompt for it */
        }
      }

      const result = await verifyLoginCode({
        integrationId: integration._id,
        phoneCode,
        password: pwd || undefined,
      });

      if (result.passwordNeeded) {
        return sendSuccessResponse({
          res,
          status: 200,
          message:
            "Two-factor authentication required. Please supply your Telegram password.",
          data: { passwordNeeded: true },
        });
      }

      if (!result.sessionString) {
        return sendErrorResponse({
          res,
          status: 500,
          message: "Telegram verification failed: no session received.",
        });
      }

      integration.telegram = integration.telegram || {};
      integration.telegram.sessionString = encrypt(result.sessionString);
      integration.telegram.connected = true;
      integration.telegram.lastConnectedAt = new Date();
      if (pwd && !integration.telegram.twoFactorPassword) {
        integration.telegram.twoFactorPassword = encrypt(pwd);
      }
      integration.markModified("telegram");
      await integration.save();

      return sendSuccessResponse({
        res,
        status: 200,
        message: "Telegram connected successfully.",
        data: {
          connected: true,
          lastConnectedAt: integration.telegram.lastConnectedAt,
        },
      });
    } catch (error) {
      console.error("Telegram verify-code error:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to verify Telegram login code.",
      });
    }
  },

  /** Disconnect telegram client + clear stored session. */
  telegramDisconnect: async (req, res) => {
    try {
      const { id } = req.params;
      const found = await findIntegrationOr404(id);
      if (found.error) {
        return sendErrorResponse({
          res,
          status: found.error.status,
          message: found.error.message,
        });
      }
      const integration = found.doc;
      if (integration.type !== "telegram") {
        return sendErrorResponse({
          res,
          status: 400,
          message: "This endpoint only works for telegram integrations.",
        });
      }
      try {
        await disconnectClient(integration._id);
      } catch {
        /* ignore */
      }
      integration.telegram = integration.telegram || {};
      integration.telegram.sessionString = "";
      integration.telegram.connected = false;
      integration.markModified("telegram");
      await integration.save();
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Telegram disconnected.",
        data: { connected: false },
      });
    } catch (error) {
      console.error("Telegram disconnect error:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to disconnect Telegram.",
      });
    }
  },
};

export default messagingIntegrationController;
