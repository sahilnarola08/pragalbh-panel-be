import MessagingIntegration from "../models/messagingIntegration.js";
import { sendMessage as sendTelegramUserMessage } from "./telegramUserService.js";

const ENV_WHATSAPP_API_BASE =
  process.env.WHATSAPP_API_BASE || "https://api.deropo.com/api";
const ENV_WHATSAPP_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN || "";

const normalizeIndianNumber = (raw) => {
  if (!raw) return "";
  let n = String(raw).replace(/\D/g, "");
  if (n.length === 10) n = `91${n}`;
  return n;
};

/**
 * Resolve which messaging integration to use for a send.
 *
 * Priority:
 *  1. explicit integrationId (must be active + not deleted)
 *  2. an active integration of `type` whose `platforms` includes any of `platformIds`
 *  3. the default integration (isDefault: true) of `type`
 *  4. the first active integration of `type`
 *  5. `null` (caller falls back to env vars)
 */
export async function resolveIntegration({
  integrationId,
  type = "whatsapp",
  platformIds = [],
} = {}) {
  const baseFilter = { type, isDeleted: false, isActive: true };

  if (integrationId && /^[a-f\d]{24}$/i.test(String(integrationId))) {
    const explicit = await MessagingIntegration.findOne({
      _id: integrationId,
      ...baseFilter,
    }).lean();
    if (explicit) return explicit;
  }

  if (Array.isArray(platformIds) && platformIds.length > 0) {
    const validIds = platformIds
      .map((p) => String(p || "").trim())
      .filter((p) => /^[a-f\d]{24}$/i.test(p));
    if (validIds.length > 0) {
      const byPlatform = await MessagingIntegration.findOne({
        ...baseFilter,
        platforms: { $in: validIds },
      })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
      if (byPlatform) return byPlatform;
    }
  }

  const def = await MessagingIntegration.findOne({
    ...baseFilter,
    isDefault: true,
  }).lean();
  if (def) return def;

  const anyActive = await MessagingIntegration.findOne(baseFilter)
    .sort({ createdAt: 1 })
    .lean();
  return anyActive || null;
}

/**
 * Send a WhatsApp text message via the upstream Deropo-style API. The
 * integration (when provided) supplies the credentials; otherwise env vars
 * are used so legacy callers keep working.
 */
export async function sendWhatsAppText({
  number,
  message,
  integration = null,
}) {
  const apiBase =
    integration?.apiBase?.trim() || ENV_WHATSAPP_API_BASE;
  const accessToken =
    integration?.accessToken?.trim() || ENV_WHATSAPP_TOKEN;

  if (!accessToken) {
    return {
      ok: false,
      status: 500,
      body: { message: "WhatsApp access token is not configured." },
    };
  }

  const normalizedNumber = normalizeIndianNumber(number);
  if (!normalizedNumber || normalizedNumber.length < 10) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid recipient phone number." },
    };
  }

  const payload = {
    number: normalizedNumber,
    type: "text",
    message,
  };
  const deviceId = integration?.deviceId?.trim();
  if (deviceId) payload.device_id = deviceId;

  const upstream = await fetch(`${apiBase.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": accessToken,
    },
    body: JSON.stringify(payload),
  });

  const contentType = upstream.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : { raw: await upstream.text() };

  return { ok: upstream.ok, status: upstream.status, body };
}

/**
 * Send a Telegram text message via the integration's MTProto (GramJS) user
 * account. Recipient is identified by `telegramUsername` (preferred) with a
 * `contactNumber` fallback (resolved via contacts.ImportContacts).
 *
 * Rate-limiting and FLOOD_WAIT handling are done inside telegramUserService.
 */
export async function sendTelegramText({
  telegramUsername,
  contactNumber,
  message,
  integration = null,
}) {
  if (!integration) {
    return {
      ok: false,
      status: 400,
      body: {
        message:
          "No Telegram integration is configured. Add one in Messaging Integrations.",
      },
    };
  }
  return sendTelegramUserMessage(integration, {
    telegramUsername,
    contactNumber,
    message,
  });
}

export { normalizeIndianNumber };
