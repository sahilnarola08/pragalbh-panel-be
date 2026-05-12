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

const messagingDispatchController = {
  sendOrderInvoiceTelegram,
};

export default messagingDispatchController;
