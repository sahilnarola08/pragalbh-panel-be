import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../util/commonResponses.js";
import Order from "../models/order.js";
import User from "../models/user.js";
import {
  sendWhatsAppText,
  resolveIntegration,
  normalizeIndianNumber,
} from "../services/messagingService.js";
import { buildOrderInvoiceMessage } from "../util/invoiceMessageBuilder.js";

const whatsappController = {
  /**
   * Generic ad-hoc test send. Optional `integrationId` chooses which saved
   * integration to use; otherwise falls back to the default WhatsApp
   * integration, then to env vars.
   */
  sendTestMessage: async (req, res) => {
    try {
      const { number, message, integrationId } = req.body || {};

      const normalizedNumber = normalizeIndianNumber(number);
      const finalMessage =
        typeof message === "string" && message.trim()
          ? message.trim()
          : "Hello from Pragalbh Panel test!";

      if (!normalizedNumber || normalizedNumber.length < 10) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Please provide a valid phone number.",
        });
      }

      const integration = await resolveIntegration({
        integrationId,
        type: "whatsapp",
      });

      const { ok, status, body } = await sendWhatsAppText({
        number: normalizedNumber,
        message: finalMessage,
        integration,
      });

      if (!ok) {
        return sendErrorResponse({
          res,
          status,
          message:
            body?.message || `WhatsApp API responded with status ${status}`,
          error: body,
        });
      }

      return sendSuccessResponse({
        res,
        status: 200,
        message: "WhatsApp test message sent.",
        data: {
          to: normalizedNumber,
          sentMessage: finalMessage,
          integrationId: integration?._id || null,
          integrationName: integration?.name || null,
          provider: body,
        },
      });
    } catch (error) {
      console.error("WhatsApp send error:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to send WhatsApp message.",
      });
    }
  },

  /**
   * Sends a formatted order invoice to a customer over WhatsApp.
   * Body:
   *   - orderId: Mongo _id or human orderId (required)
   *   - phoneNumber: explicit phone (optional; fallback: customer lookup by name)
   *   - customerName: friendly greeting name (optional)
   *   - integrationId: choose a specific integration (optional)
   *
   * Routing fallback:
   *   integrationId → integration matching the order's product platform(s) →
   *   default whatsapp integration → first active whatsapp integration → env vars.
   */
  sendOrderInvoice: async (req, res) => {
    try {
      const { orderId, phoneNumber, customerName, integrationId } =
        req.body || {};

      if (!orderId) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "orderId is required.",
        });
      }

      const orQuery = [{ orderId: String(orderId).trim() }];
      if (/^[a-f\d]{24}$/i.test(String(orderId).trim())) {
        orQuery.push({ _id: String(orderId).trim() });
      }
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

      // Pull platform IDs (both root platform AND sub-account) from products
      // so a "Amazon - Seller Account A" specific integration also gets matched.
      const platformIds = Array.from(
        new Set(
          (order.products || []).flatMap((p) =>
            [p?.orderPlatform, p?.orderPlatformAccount].filter(Boolean).map(String),
          ),
        ),
      );

      const integration = await resolveIntegration({
        integrationId,
        type: "whatsapp",
        platformIds,
      });

      let resolvedPhone = normalizeIndianNumber(phoneNumber);
      let resolvedName = (customerName || order.clientName || "").trim();

      if (!resolvedPhone && order.clientName) {
        const nameParts = String(order.clientName).trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const userQuery = lastName ? { firstName, lastName } : { firstName };
        const customer = await User.findOne({
          ...userQuery,
          isDeleted: { $ne: true },
          contactNumber: { $type: "string", $gt: "" },
        }).lean();
        if (customer?.contactNumber) {
          resolvedPhone = normalizeIndianNumber(customer.contactNumber);
          resolvedName = customer.firstName
            ? `${customer.firstName} ${customer.lastName || ""}`.trim()
            : resolvedName;
        }
      }

      if (!resolvedPhone || resolvedPhone.length < 10) {
        return sendErrorResponse({
          res,
          status: 400,
          message:
            "Customer phone number is not available. Please provide a phone number or update the customer's contact info.",
        });
      }

      const messageBody = buildOrderInvoiceMessage(order, resolvedName);

      const { ok, status, body } = await sendWhatsAppText({
        number: resolvedPhone,
        message: messageBody,
        integration,
      });

      if (!ok) {
        return sendErrorResponse({
          res,
          status,
          message:
            body?.message || `WhatsApp API responded with status ${status}`,
          error: body,
        });
      }

      return sendSuccessResponse({
        res,
        status: 200,
        message: "Order invoice sent on WhatsApp.",
        data: {
          to: resolvedPhone,
          orderId: order.orderId,
          integrationId: integration?._id || null,
          integrationName: integration?.name || null,
          provider: body,
        },
      });
    } catch (error) {
      console.error("WhatsApp order invoice send error:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: error?.message || "Failed to send WhatsApp invoice.",
      });
    }
  },
};

export default whatsappController;
