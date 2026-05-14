import User from "../models/user.js";
import { ORDER_STATUS } from "../helper/enums.js";
import { secret } from "../config/secret.js";
import {
  sendWhatsAppText,
  sendTelegramText,
  resolveIntegration,
  normalizeIndianNumber,
} from "./messagingService.js";
import { sendMailWithEmailIntegrationOrEnv } from "./emailSmtpIntegrationService.js";

const NOTIFY_STATUSES = new Set([
  ORDER_STATUS.DISPATCH,
  ORDER_STATUS.UPDATED_TRACKING_ID,
  ORDER_STATUS.REVIEW,
]);

const emailLooksValid = (raw) => {
  const e = String(raw || "").trim();
  if (!e || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const lower = e.toLowerCase();
  if (lower.endsWith("@order.local") || lower.endsWith(".invalid")) return false;
  return true;
};

/** Escape dynamic text for GramJS legacy `markdown` parse mode. */
const escapeTelegramMarkdownLegacy = (text) =>
  String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[");

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const platformIdsFromOrder = (order) =>
  Array.from(
    new Set(
      (order.products || []).flatMap((p) =>
        [p?.orderPlatform, p?.orderPlatformAccount].filter(Boolean).map(String),
      ),
    ),
  );

const splitClientName = (clientName) => {
  const parts = String(clientName || "").trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";
  return { firstName, lastName };
};

/**
 * Match customer User by order.clientName (same strategy as WhatsApp invoice).
 */
async function resolveCustomerContactsFromOrder(order) {
  const out = {
    displayName: String(order.clientName || "").trim() || "Customer",
    phone: "",
    telegramUsername: "",
    email: "",
  };

  if (!order.clientName) return out;

  const { firstName, lastName } = splitClientName(order.clientName);
  const userQuery = lastName ? { firstName, lastName } : { firstName };

  const customer = await User.findOne({
    ...userQuery,
    isDeleted: { $ne: true },
  }).lean();

  if (customer) {
    if (customer.firstName) {
      out.displayName =
        `${customer.firstName} ${customer.lastName || ""}`.trim() || out.displayName;
    }
    if (customer.contactNumber) out.phone = String(customer.contactNumber).trim();
    if (customer.telegramUsername) {
      out.telegramUsername = String(customer.telegramUsername)
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();
    }
    if (customer.email) out.email = String(customer.email).trim();
  }

  return out;
}

const productSummary = (order) => {
  const names = (order.products || []).map((p) => p?.productName).filter(Boolean);
  if (!names.length) return "your order";
  if (names.length === 1) return names[0];
  return `${names[0]} (+${names.length - 1} more)`;
};

const formatOrderDate = (order) => {
  const d = order.createdAt ? new Date(order.createdAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const guessCarrierTrackingUrl = (courierCompany, trackingId) => {
  const c = String(courierCompany || "").toLowerCase();
  const id = String(trackingId || "").trim();
  if (!id) return "";
  const enc = encodeURIComponent(id);
  if (/fedex/.test(c)) return `https://www.fedex.com/fedextrack/?trknbr=${enc}`;
  if (/\bups\b/.test(c)) return `https://www.ups.com/track?loc=en_US&tracknum=${enc}`;
  if (/usps|u\.s\.?\s*postal|postal\s*service/.test(c)) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
  }
  if (/dhl/.test(c)) return `https://www.dhl.com/en/express/tracking.html?AWB=${enc}&brand=DHL`;
  if (/aramex/.test(c)) return `https://www.aramex.com/track/results?cust=${enc}`;
  return "";
};

const trackingLinesForOrder = (order) => {
  const entries = Array.isArray(order.trackingEntries) ? order.trackingEntries : [];
  const rows = entries.filter((e) => e?.trackingId && e?.courierCompany);
  if (rows.length) {
    return rows.map((e) => {
      const url = guessCarrierTrackingUrl(e.courierCompany, e.trackingId);
      return { courier: e.courierCompany, id: e.trackingId, url };
    });
  }
  const tid = String(order.trackingId || "").trim();
  const cc = String(order.courierCompany || "").trim();
  if (tid && cc) {
    return [{ courier: cc, id: tid, url: guessCarrierTrackingUrl(cc, tid) }];
  }
  return [];
};

const buildDispatchCopy = (order, displayName) => {
  const oid = order.orderId || String(order._id || "");
  const product = productSummary(order);
  const dateStr = formatOrderDate(order);
  const address = String(order.address || "").trim();

  const wa = [
    `Dear ${displayName},`,
    "",
    `Your order ${oid} — ${product} — has been dispatched from PRAGALBH JEWELS.`,
    "",
    "Your piece has been packed with care. You will receive your tracking number and tracking link in a separate message as soon as the carrier updates the shipment.",
    "",
    "If you have any questions, please reply here and our team will assist you promptly.",
    "",
    "Thank you for your trust.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  const emailSubject = `Your order ${oid} has been dispatched — PRAGALBH JEWELS`;
  const emailText = [
    `Dear ${displayName},`,
    "",
    `We are pleased to inform you that your order ${oid}${dateStr ? `, placed on ${dateStr},` : ""} has been dispatched.`,
    "",
    `Product: ${product}`,
    "",
    "Your order has been securely packed and handed over for shipping. Tracking details will follow in a separate email once they are available from the carrier.",
    "",
    address ? `Shipping address on file:\n${address}\n` : "",
    "If any detail needs to be corrected, please contact us immediately with your order number.",
    "",
    "Kind regards,",
    "PRAGALBH JEWELS",
  ]
    .filter(Boolean)
    .join("\n");

  const emailHtml = [
    `<p>Dear ${escapeHtml(displayName)},</p>`,
    `<p>We are pleased to inform you that your order <strong>${escapeHtml(oid)}</strong>${
      dateStr ? `, placed on <strong>${escapeHtml(dateStr)}</strong>,` : ""
    } has been dispatched.</p>`,
    `<p><strong>Product:</strong> ${escapeHtml(product)}</p>`,
    "<p>Your order has been securely packed and handed over for shipping. Tracking details will follow in a separate email once they are available from the carrier.</p>",
    address
      ? `<p><strong>Shipping address on file:</strong><br/>${escapeHtml(address).replace(/\n/g, "<br/>")}</p>`
      : "",
    "<p>If any detail needs to be corrected, please contact us immediately with your order number.</p>",
    "<p>Kind regards,<br/>PRAGALBH JEWELS</p>",
  ]
    .filter(Boolean)
    .join("");

  const en = escapeTelegramMarkdownLegacy;
  const tg = [
    `Dear ${en(displayName)},`,
    "",
    `Your order ${en(oid)} — ${en(product)} — has been dispatched from PRAGALBH JEWELS.`,
    "",
    "Your piece has been packed with care. You will receive your tracking number and tracking link in a separate message as soon as the carrier updates the shipment.",
    "",
    "If you have any questions, please reply here and our team will assist you promptly.",
    "",
    "Thank you for your trust.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  return { wa, tg, emailSubject, emailText, emailHtml };
};

const buildTrackingCopy = (order, displayName) => {
  const oid = order.orderId || String(order._id || "");
  const product = productSummary(order);
  const lines = trackingLinesForOrder(order);

  let trackingBlock = "";
  if (lines.length) {
    trackingBlock = lines
      .map((row, i) => {
        const n = i + 1;
        const urlLine = row.url ? `\nTrack: ${row.url}` : "";
        return `Package ${n}\nCourier: ${row.courier}\nTracking number: ${row.id}${urlLine}`;
      })
      .join("\n\n");
  } else {
    trackingBlock =
      "Your shipment is registered. Detailed tracking numbers will appear in your order portal shortly.";
  }

  const wa = [
    `Dear ${displayName},`,
    "",
    `Your shipment for order ${oid} is now trackable.`,
    "",
    trackingBlock,
    "",
    "Please allow a short time for the carrier's system to update. If a link does not open, use the tracking number on the carrier's website.",
    "",
    "For any delivery-related questions, reply with your order ID.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  const en = escapeTelegramMarkdownLegacy;
  let tgTrackingBlock = "";
  if (lines.length) {
    tgTrackingBlock = lines
      .map((row, i) => {
        const n = i + 1;
        const urlLine = row.url ? `\nTrack: ${row.url}` : "";
        return `Package ${n}\nCourier: ${en(row.courier)}\nTracking number: ${en(row.id)}${urlLine}`;
      })
      .join("\n\n");
  } else {
    tgTrackingBlock =
      "Your shipment is registered. Detailed tracking numbers will appear in your order portal shortly.";
  }

  const tg = [
    `Dear ${en(displayName)},`,
    "",
    `Your shipment for order ${en(oid)} is now trackable.`,
    "",
    tgTrackingBlock,
    "",
    "Please allow a short time for the carrier's system to update. If a link does not open, use the tracking number on the carrier's website.",
    "",
    "For any delivery-related questions, reply with your order ID.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  const emailSubject = `Tracking details for order ${oid} — PRAGALBH JEWELS`;
  const emailText = [
    `Dear ${displayName},`,
    "",
    `Your order ${oid} (${product}) is now trackable with the carrier.`,
    "",
    trackingBlock,
    "",
    "It may take a few hours for tracking information to appear on the carrier's portal.",
    "",
    "Should you notice any issue with delivery or the tracking status, please contact us and include your order number in your message.",
    "",
    "Best regards,",
    "PRAGALBH JEWELS",
  ].join("\n");

  const listHtml =
    lines.length > 0
      ? `<ul>${lines
          .map(
            (row) =>
              `<li><strong>${escapeHtml(row.courier)}</strong> — ${escapeHtml(row.id)}${
                row.url
                  ? ` — <a href="${escapeHtml(row.url)}">Track shipment</a>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`
      : `<p>${escapeHtml(
          "Your shipment is registered. Detailed tracking numbers will appear in your order portal shortly.",
        )}</p>`;

  const emailHtml = [
    `<p>Dear ${escapeHtml(displayName)},</p>`,
    `<p>Your order <strong>${escapeHtml(oid)}</strong> (${escapeHtml(
      product,
    )}) is now trackable with the carrier.</p>`,
    listHtml,
    "<p>It may take a few hours for tracking information to appear on the carrier's portal.</p>",
    "<p>Should you notice any issue with delivery or the tracking status, please contact us and include your order number in your message.</p>",
    "<p>Best regards,<br/>PRAGALBH JEWELS</p>",
  ].join("");

  return { wa, tg, emailSubject, emailText, emailHtml };
};

const buildReviewCopy = (order, displayName) => {
  const oid = order.orderId || String(order._id || "");
  const product = productSummary(order);

  const wa = [
    `Dear ${displayName},`,
    "",
    `We hope your ${product} from order ${oid} has arrived safely and that you are delighted with it.`,
    "",
    "If you have a moment, we would greatly appreciate your feedback. It helps us improve and helps other clients make informed choices.",
    "",
    "Thank you again for choosing PRAGALBH JEWELS.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  const emailSubject = `We would love your feedback — order ${oid} — PRAGALBH JEWELS`;
  const emailText = [
    `Dear ${displayName},`,
    "",
    `We hope your ${product} (order ${oid}) has reached you in perfect condition and that you are satisfied with your purchase.`,
    "",
    "Your opinion matters to us. If you could spare a few minutes to share your experience, we would be very grateful. You may simply reply to this email with your comments.",
    "",
    "Thank you for your business. We look forward to serving you again.",
    "",
    "Warm regards,",
    "PRAGALBH JEWELS",
  ].join("\n");

  const emailHtml = [
    `<p>Dear ${escapeHtml(displayName)},</p>`,
    `<p>We hope your <strong>${escapeHtml(product)}</strong> (order <strong>${escapeHtml(
      oid,
    )}</strong>) has reached you in perfect condition and that you are satisfied with your purchase.</p>`,
    "<p>Your opinion matters to us. If you could spare a few minutes to share your experience, we would be very grateful. You may simply reply to this email with your comments.</p>",
    "<p>Thank you for your business. We look forward to serving you again.</p>",
    "<p>Warm regards,<br/>PRAGALBH JEWELS</p>",
  ].join("");

  const en = escapeTelegramMarkdownLegacy;
  const tg = [
    `Dear ${en(displayName)},`,
    "",
    `We hope your ${en(product)} from order ${en(oid)} has arrived safely and that you are delighted with it.`,
    "",
    "If you have a moment, we would greatly appreciate your feedback. It helps us improve and helps other clients make informed choices.",
    "",
    "Thank you again for choosing PRAGALBH JEWELS.",
    "",
    "PRAGALBH JEWELS",
  ].join("\n");

  return { wa, tg, emailSubject, emailText, emailHtml };
};

const pickCopy = (status, order, displayName) => {
  if (status === ORDER_STATUS.DISPATCH) return buildDispatchCopy(order, displayName);
  if (status === ORDER_STATUS.UPDATED_TRACKING_ID) {
    return buildTrackingCopy(order, displayName);
  }
  if (status === ORDER_STATUS.REVIEW) return buildReviewCopy(order, displayName);
  return null;
};

/** @param {'sent'|'skipped'|'failed'} outcome */
const channelResult = (outcome, detail) => ({
  outcome,
  ...(detail ? { detail: String(detail).slice(0, 500) } : {}),
});

const summarizeWaBody = (body) => {
  if (!body || typeof body !== "object") return "";
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return "";
  }
};

/**
 * After order status changes (or tracking form save), notify customer on WhatsApp,
 * Telegram, and email when integrations and contact details are available.
 *
 * @param {object} order — plain object or lean doc with status, clientName, products, etc.
 * @param {string} previousStatus — status before this update
 * @param {{ forceNotifyTracking?: boolean }} [options] — set true from updateTrackingInfo so repeat tracking edits still notify
 * @returns {Promise<object>} Result for API / staff UI (see `attempted`, `whatsapp`, `telegram`, `email`).
 */
export async function notifyOrderLifecycleStatusChange(order, previousStatus, options = {}) {
  const { forceNotifyTracking = false } = options;
  const status = order.status;

  if (!secret.orderLifecycleNotifyEnabled) {
    return {
      attempted: false,
      disabled: true,
      reason: "notifications_disabled",
      detail: "Unset or ORDER_LIFECYCLE_NOTIFY_ENABLED=true enables customer messages.",
    };
  }

  if (status === ORDER_STATUS.UPDATED_TRACKING_ID && forceNotifyTracking) {
    // always send (new or edited tracking)
  } else {
    if (previousStatus === status) {
      return { attempted: false, reason: "status_unchanged" };
    }
    if (!NOTIFY_STATUSES.has(status)) {
      return { attempted: false, reason: "status_not_notified" };
    }
  }

  let contacts;
  try {
    contacts = await resolveCustomerContactsFromOrder(order);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[orderStatusNotify] customer lookup failed:", msg);
    return { attempted: false, reason: "customer_lookup_failed", detail: msg };
  }

  const displayName = contacts.displayName;
  const fullCopy = pickCopy(status, order, displayName);
  if (!fullCopy) {
    return { attempted: false, reason: "no_message_template" };
  }

  const platformIds = platformIdsFromOrder(order);

  const [waIntegration, tgIntegration, emailIntegration] = await Promise.all([
    resolveIntegration({ type: "whatsapp", platformIds }),
    resolveIntegration({ type: "telegram", platformIds }),
    resolveIntegration({ type: "email", platformIds }),
  ]);

  const phone = normalizeIndianNumber(contacts.phone);
  const tgUser = contacts.telegramUsername;
  const tgPhone = contacts.phone ? String(contacts.phone).trim() : "";
  const emailTo = contacts.email;

  const logPrefix = `[orderStatusNotify] order=${order.orderId || order._id} status=${status}`;

  /** @type {{ outcome: string, detail?: string }} */
  let whatsapp = channelResult("skipped", "No valid phone on customer record");
  /** @type {{ outcome: string, detail?: string }} */
  let telegram = channelResult(
    "skipped",
    "No Telegram username or phone on customer record",
  );
  /** @type {{ outcome: string, detail?: string }} */
  let email = channelResult("skipped", "No valid email on customer record");

  if (phone && phone.length >= 10) {
    try {
      const { ok, status: httpStatus, body } = await sendWhatsAppText({
        number: phone,
        message: fullCopy.wa,
        integration: waIntegration,
      });
      if (ok) {
        whatsapp = channelResult("sent");
        console.info(`${logPrefix} WhatsApp OK → ${phone}`);
      } else {
        const detail = summarizeWaBody(body) || `HTTP ${httpStatus}`;
        whatsapp = channelResult("failed", detail);
        console.error(`${logPrefix} WhatsApp failed`, httpStatus, body);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      whatsapp = channelResult("failed", msg);
      console.error(`${logPrefix} WhatsApp error:`, msg);
    }
  } else {
    console.info(`${logPrefix} WhatsApp skipped (no valid phone on customer)`);
  }

  if (tgUser || (tgPhone && tgPhone.replace(/\D/g, "").length >= 10)) {
    try {
      const { ok, status: httpStatus, body } = await sendTelegramText({
        telegramUsername: tgUser,
        contactNumber: tgUser ? "" : tgPhone,
        message: fullCopy.tg,
        integration: tgIntegration,
      });
      if (ok) {
        telegram = channelResult("sent");
        console.info(`${logPrefix} Telegram OK`);
      } else {
        const detail =
          (body && typeof body.message === "string" && body.message) ||
          summarizeWaBody(body) ||
          `HTTP ${httpStatus}`;
        telegram = channelResult("failed", detail);
        console.error(`${logPrefix} Telegram failed`, httpStatus, body);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      telegram = channelResult("failed", msg);
      console.error(`${logPrefix} Telegram error:`, msg);
    }
  } else {
    console.info(`${logPrefix} Telegram skipped (no username / phone on customer)`);
  }

  if (emailLooksValid(emailTo)) {
    try {
      await sendMailWithEmailIntegrationOrEnv({
        integration: emailIntegration,
        to: emailTo,
        subject: fullCopy.emailSubject,
        html: fullCopy.emailHtml,
        text: fullCopy.emailText,
      });
      email = channelResult("sent");
      console.info(`${logPrefix} Email OK → ${emailTo}`);
    } catch (e) {
      const msg = e?.message || String(e);
      email = channelResult("failed", msg);
      console.error(`${logPrefix} Email error:`, msg);
    }
  } else {
    console.info(`${logPrefix} Email skipped (no valid email on customer)`);
  }

  return {
    attempted: true,
    orderStatus: status,
    whatsapp,
    telegram,
    email,
  };
}
