import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../util/commonResponses.js";
import Order from "../models/order.js";
import User from "../models/user.js";
import {
  sendTelegramText,
  resolveIntegration,
} from "../services/messagingService.js";
import { buildOrderInvoiceMessage } from "../util/invoiceMessageBuilder.js";
import {
  buildOrderInvoiceEmail,
  getDemoOrderForInvoicePreview,
} from "../util/invoiceEmailBuilder.js";
import { sendMailWithEmailIntegrationOrEnv } from "../services/emailSmtpIntegrationService.js";

const isHexId = (v) => /^[a-f\d]{24}$/i.test(String(v || "").trim());

/**
 * Dispatch the order invoice to the customer over Telegram. Mirrors the
 * shape and routing of the existing WhatsApp endpoint so the order create
 * flow can use it as a parallel send.
 *
 * Body:
 *   - orderId           (required)
 *   - telegramUsername  (optional explicit override; else from customer)
 *   - contactNumber     (optional explicit override; else from customer)
 *   - customerName      (optional friendly greeting)
 *   - integrationId     (optional, picks a specific telegram integration)
 */
const sendOrderInvoiceTelegram = async (req, res) => {
  try {
    const {
      orderId,
      telegramUsername,
      contactNumber,
      customerName,
      integrationId,
    } = req.body || {};

    if (!orderId) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "orderId is required.",
      });
    }

    const orQuery = [{ orderId: String(orderId).trim() }];
    if (isHexId(orderId)) orQuery.push({ _id: String(orderId).trim() });

    const order = await Order.findOne({
      $or: orQuery,
      isDeleted: { $ne: true },
    }).lean();

    if (!order) {
      return sendErrorResponse({
        res,
        status: 404,
        message: "Order not found.",
      });
    }

    // Pull platform IDs (root + sub-account) from products so an
    // Etsy-specific Telegram integration matches Etsy orders.
    const platformIds = Array.from(
      new Set(
        (order.products || []).flatMap((p) =>
          [p?.orderPlatform, p?.orderPlatformAccount].filter(Boolean).map(String),
        ),
      ),
    );

    const integration = await resolveIntegration({
      integrationId,
      type: "telegram",
      platformIds,
    });

    if (!integration) {
      return sendErrorResponse({
        res,
        status: 400,
        message:
          "No active Telegram integration found. Configure one in Messaging Integrations first.",
      });
    }

    let resolvedUsername = String(telegramUsername || "").trim();
    let resolvedPhone = String(contactNumber || "").trim();
    let resolvedName = (customerName || order.clientName || "").trim();

    // If neither identifier was supplied explicitly, look up the customer.
    if ((!resolvedUsername && !resolvedPhone) && order.clientName) {
      const nameParts = String(order.clientName).trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const userQuery = lastName ? { firstName, lastName } : { firstName };
      const customer = await User.findOne({
        ...userQuery,
        isDeleted: { $ne: true },
      }).lean();
      if (customer) {
        if (customer.telegramUsername)
          resolvedUsername = String(customer.telegramUsername);
        if (customer.contactNumber)
          resolvedPhone = String(customer.contactNumber);
        if (customer.firstName) {
          resolvedName =
            `${customer.firstName} ${customer.lastName || ""}`.trim() ||
            resolvedName;
        }
      }
    }

    if (!resolvedUsername && !resolvedPhone) {
      return sendErrorResponse({
        res,
        status: 400,
        message:
          "Customer has no Telegram username and no phone number on file. Add one to send a Telegram invoice.",
      });
    }

    const messageBody = buildOrderInvoiceMessage(order, resolvedName);

    const { ok, status, body } = await sendTelegramText({
      telegramUsername: resolvedUsername,
      contactNumber: resolvedPhone,
      message: messageBody,
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
      message: "Order invoice sent on Telegram.",
      data: {
        toUsername: resolvedUsername || null,
        toPhone: resolvedPhone || null,
        orderId: order.orderId,
        integrationId: integration?._id || null,
        integrationName: integration?.name || null,
        provider: body,
      },
    });
  } catch (error) {
    console.error("Telegram order invoice send error:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to send Telegram invoice.",
    });
  }
};

const emailLooksValid = (raw) => {
  const e = String(raw || "").trim();
  if (!e || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const lower = e.toLowerCase();
  if (lower.endsWith("@order.local") || lower.endsWith(".invalid")) return false;
  return true;
};

const loadOrderByFlexibleId = async (orderId) => {
  const orQuery = [{ orderId: String(orderId).trim() }];
  if (isHexId(orderId)) orQuery.push({ _id: String(orderId).trim() });
  return Order.findOne({
    $or: orQuery,
    isDeleted: { $ne: true },
  }).lean();
};

/**
 * Body: { orderId?: string } — if omitted, uses demo sample order.
 * Returns { subject, html } for in-app preview (no email sent).
 */
const previewOrderInvoiceEmail = async (req, res) => {
  try {
    const { orderId, customerName } = req.body || {};
    let order;
    if (orderId && String(orderId).trim()) {
      order = await loadOrderByFlexibleId(orderId);
      if (!order) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Order not found.",
        });
      }
    } else {
      order = getDemoOrderForInvoicePreview();
    }
    const name =
      (customerName && String(customerName).trim()) ||
      order.clientName ||
      "Customer";
    const { subject, html } = buildOrderInvoiceEmail(order, name, {});
    return sendSuccessResponse({
      res,
      status: 200,
      message: "Invoice email preview generated.",
      data: { subject, html, isSample: !orderId || !String(orderId).trim() },
    });
  } catch (error) {
    console.error("Invoice email preview error:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to build invoice email preview.",
    });
  }
};

/**
 * Sends the HTML invoice template to the logged-in staff user's email
 * (for design QA). Body: { orderId?, customerName?, integrationId? }
 * When `integrationId` is set, that email integration's SMTP is used.
 * Else when `orderId` is set, SMTP is resolved from the order's platforms.
 * Else global env SMTP is used.
 */
const sendTestInvoiceEmail = async (req, res) => {
  try {
    const to = req.user?.email;
    if (!emailLooksValid(to)) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Your account has no valid email address to send a test to.",
      });
    }

    const { orderId, customerName, integrationId } = req.body || {};
    let integration = null;
    if (integrationId && isHexId(integrationId)) {
      integration = await resolveIntegration({
        integrationId,
        type: "email",
        platformIds: [],
      });
    } else if (orderId && String(orderId).trim()) {
      const order = await loadOrderByFlexibleId(orderId);
      if (order) {
        const platformIds = Array.from(
          new Set(
            (order.products || []).flatMap((p) =>
              [p?.orderPlatform, p?.orderPlatformAccount]
                .filter(Boolean)
                .map(String),
            ),
          ),
        );
        integration = await resolveIntegration({
          type: "email",
          platformIds,
        });
      }
    }

    let order;
    if (orderId && String(orderId).trim()) {
      order = await loadOrderByFlexibleId(orderId);
      if (!order) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Order not found.",
        });
      }
    } else {
      order = getDemoOrderForInvoicePreview();
    }
    const name =
      (customerName && String(customerName).trim()) ||
      order.clientName ||
      "Customer";
    const { subject, html, text } = buildOrderInvoiceEmail(order, name, {});

    try {
      await sendMailWithEmailIntegrationOrEnv({
        integration,
        to,
        subject: `[Test / preview] ${subject}`,
        html,
        text,
      });
    } catch (sendErr) {
      return sendErrorResponse({
        res,
        status: sendErr.statusCode || 500,
        message: sendErr.message || "Failed to send test invoice email.",
      });
    }

    return sendSuccessResponse({
      res,
      status: 200,
      message: `Test invoice email sent to ${to}.`,
      data: {
        to,
        isSample: !orderId || !String(orderId).trim(),
        usedIntegrationId: integration?._id || null,
      },
    });
  } catch (error) {
    console.error("Test invoice email error:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to send test invoice email.",
    });
  }
};

/**
 * Body:
 *   - orderId (required)
 *   - email (optional override)
 *   - customerName (optional)
 *   - integrationId (optional) — force a specific email integration's SMTP
 */
const sendOrderInvoiceEmail = async (req, res) => {
  try {
    const { orderId, email, customerName, integrationId } = req.body || {};

    if (!orderId) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "orderId is required.",
      });
    }

    const order = await loadOrderByFlexibleId(orderId);
    if (!order) {
      return sendErrorResponse({
        res,
        status: 404,
        message: "Order not found.",
      });
    }

    const platformIds = Array.from(
      new Set(
        (order.products || []).flatMap((p) =>
          [p?.orderPlatform, p?.orderPlatformAccount]
            .filter(Boolean)
            .map(String),
        ),
      ),
    );

    const integration = await resolveIntegration({
      integrationId,
      type: "email",
      platformIds,
    });

    let resolvedEmail = String(email || "").trim();
    let resolvedName = (customerName || order.clientName || "").trim();

    if (!resolvedEmail && order.clientName) {
      const nameParts = String(order.clientName).trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const userQuery = lastName ? { firstName, lastName } : { firstName };
      const customer = await User.findOne({
        ...userQuery,
        isDeleted: { $ne: true },
      }).lean();
      if (customer?.email) resolvedEmail = String(customer.email).trim();
      if (customer?.firstName) {
        resolvedName =
          `${customer.firstName} ${customer.lastName || ""}`.trim() ||
          resolvedName;
      }
    }

    if (!emailLooksValid(resolvedEmail)) {
      return sendErrorResponse({
        res,
        status: 400,
        message:
          "Customer email is not available. Add an email on the customer record or pass `email` in the request body.",
      });
    }

    const { subject, html, text } = buildOrderInvoiceEmail(
      order,
      resolvedName,
      {},
    );

    try {
      await sendMailWithEmailIntegrationOrEnv({
        integration,
        to: resolvedEmail,
        subject,
        html,
        text,
      });
    } catch (sendErr) {
      return sendErrorResponse({
        res,
        status: sendErr.statusCode || 500,
        message: sendErr.message || "Failed to send invoice email.",
      });
    }

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Order invoice emailed to the customer.",
      data: {
        to: resolvedEmail,
        orderId: order.orderId,
        integrationId: integration?._id || null,
      },
    });
  } catch (error) {
    console.error("Order invoice email error:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to send invoice email.",
    });
  }
};

const messagingDispatchController = {
  sendOrderInvoiceTelegram,
  previewOrderInvoiceEmail,
  sendTestInvoiceEmail,
  sendOrderInvoiceEmail,
};

export default messagingDispatchController;
