import Payment from "../models/payment.js";
import Mediator from "../models/mediator.js";
import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";
import { PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const applyMediatorDefaults = async (payload) => {
  if (!payload.mediatorId) return payload;
  const mediator = await Mediator.findById(payload.mediatorId).lean();
  if (!mediator) return payload;
  if (payload.mediatorCommissionType === undefined) payload.mediatorCommissionType = mediator.commissionType;
  if (payload.mediatorCommissionValue === undefined) payload.mediatorCommissionValue = mediator.commissionValue;
  const gross = round2(payload.grossAmountUSD);
  if (payload.mediatorCommissionAmount === undefined || payload.mediatorCommissionAmount === null) {
    if (mediator.commissionType === "percentage") {
      payload.mediatorCommissionAmount = round2((gross * (mediator.commissionValue || 0)) / 100);
    } else {
      payload.mediatorCommissionAmount = round2(mediator.commissionValue || 0);
    }
  }
  return payload;
};

export const createPayment = async (req, res) => {
  try {
    const body = req.body;
    const orderId = body.orderId;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return sendErrorResponse({ res, status: 400, message: "Valid orderId is required" });
    }
    const order = await Order.findById(orderId).select("_id").lean();
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }
    const grossAmountUSD = round2(body.grossAmountUSD);
    if (grossAmountUSD < 0) {
      return sendErrorResponse({ res, status: 400, message: "grossAmountUSD must be >= 0" });
    }
    if (!body.mediatorId || !mongoose.Types.ObjectId.isValid(body.mediatorId)) {
      return sendErrorResponse({ res, status: 400, message: "Valid mediatorId is required" });
    }
    const payload = {
      orderId: new mongoose.Types.ObjectId(orderId),
      productIndex: body.productIndex != null && Number.isInteger(Number(body.productIndex)) ? Number(body.productIndex) : null,
      grossAmountUSD: grossAmountUSD,
      mediatorId: new mongoose.Types.ObjectId(body.mediatorId),
      mediatorCommissionType: body.mediatorCommissionType,
      mediatorCommissionValue: body.mediatorCommissionValue != null ? round2(body.mediatorCommissionValue) : undefined,
      mediatorCommissionAmount: body.mediatorCommissionAmount != null ? round2(body.mediatorCommissionAmount) : undefined,
      conversionRate: round2(body.conversionRate || 0),
      paymentStatus: Object.values(PAYMENT_LIFECYCLE_STATUS).includes(body.paymentStatus)
        ? body.paymentStatus
        : PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR,
      transactionReference: body.transactionReference ? String(body.transactionReference).trim() : "",
      creditedDate: body.creditedDate ? new Date(body.creditedDate) : null,
      notes: body.notes ? String(body.notes).trim() : "",
    };
    if (body.bankId && mongoose.Types.ObjectId.isValid(body.bankId)) payload.bankId = new mongoose.Types.ObjectId(body.bankId);
    await applyMediatorDefaults(payload);
    const gross = round2(payload.grossAmountUSD);
    const commissionAmount = round2(payload.mediatorCommissionAmount ?? 0);
    payload.netAmountUSD = round2(gross - commissionAmount);
    const rate = round2(payload.conversionRate ?? 0);
    payload.expectedAmountINR = rate > 0 ? round2(payload.netAmountUSD * rate) : 0;
    const doc = await Payment.create(payload);
    const populated = await Payment.findById(doc._id)
      .populate("mediatorId", "name commissionType commissionValue settlementDelayDays")
      .populate("bankId", "name")
      .lean();
    return sendSuccessResponse({ res, status: 201, data: populated, message: "Payment created successfully" });
  } catch (err) {
    console.error("Create payment error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to create payment" });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Valid payment ID is required" });
    }
    const existing = await Payment.findById(id).lean();
    if (!existing) {
      return sendErrorResponse({ res, status: 404, message: "Payment not found" });
    }
    const update = {};
    if (body.grossAmountUSD !== undefined) update.grossAmountUSD = round2(body.grossAmountUSD);
    if (body.mediatorId !== undefined && mongoose.Types.ObjectId.isValid(body.mediatorId)) {
      update.mediatorId = new mongoose.Types.ObjectId(body.mediatorId);
    }
    if (body.mediatorCommissionType !== undefined) update.mediatorCommissionType = body.mediatorCommissionType === "fixed" ? "fixed" : "percentage";
    if (body.mediatorCommissionValue !== undefined) update.mediatorCommissionValue = round2(body.mediatorCommissionValue);
    if (body.mediatorCommissionAmount !== undefined) update.mediatorCommissionAmount = round2(body.mediatorCommissionAmount);
    if (body.conversionRate !== undefined) update.conversionRate = round2(body.conversionRate);
    if (body.actualBankCreditINR !== undefined) update.actualBankCreditINR = body.actualBankCreditINR === null ? null : round2(body.actualBankCreditINR);
    if (body.paymentStatus !== undefined && Object.values(PAYMENT_LIFECYCLE_STATUS).includes(body.paymentStatus)) {
      update.paymentStatus = body.paymentStatus;
    }
    if (body.transactionReference !== undefined) update.transactionReference = String(body.transactionReference).trim();
    if (body.creditedDate !== undefined) update.creditedDate = body.creditedDate ? new Date(body.creditedDate) : null;
    if (body.bankId !== undefined) update.bankId = body.bankId && mongoose.Types.ObjectId.isValid(body.bankId) ? new mongoose.Types.ObjectId(body.bankId) : null;
    if (body.notes !== undefined) update.notes = String(body.notes).trim();
    if (body.productIndex !== undefined) update.productIndex = body.productIndex == null || body.productIndex === '' ? null : (Number.isInteger(Number(body.productIndex)) ? Number(body.productIndex) : existing.productIndex);

    const merged = { ...existing, ...update };
    const gross = round2(merged.grossAmountUSD);
    const commissionAmount = round2(merged.mediatorCommissionAmount ?? 0);
    const netUSD = round2(gross - commissionAmount);
    const rate = round2(merged.conversionRate ?? 0);
    const expectedINR = rate > 0 ? round2(netUSD * rate) : 0;
    const actual = merged.actualBankCreditINR != null ? round2(merged.actualBankCreditINR) : null;
    update.netAmountUSD = netUSD;
    update.expectedAmountINR = expectedINR;
    if (actual != null) update.exchangeDifference = round2(actual - expectedINR);

    const doc = await Payment.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .populate("mediatorId", "name commissionType commissionValue settlementDelayDays")
      .populate("bankId", "name")
      .lean();
    return sendSuccessResponse({ res, status: 200, data: doc, message: "Payment updated successfully" });
  } catch (err) {
    console.error("Update payment error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to update payment" });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Invalid payment ID" });
    }
    const doc = await Payment.findById(id)
      .populate("orderId", "orderId clientName products")
      .populate("mediatorId", "name commissionType commissionValue settlementDelayDays")
      .populate("bankId", "name")
      .lean();
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Payment not found" });
    }
    return sendSuccessResponse({ res, status: 200, data: doc, message: "Payment retrieved successfully" });
  } catch (err) {
    console.error("Get payment error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to fetch payment" });
  }
};

export const getPaymentsByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return sendErrorResponse({ res, status: 400, message: "Valid orderId is required" });
    }
    const list = await Payment.find({ orderId, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .populate("mediatorId", "name commissionType commissionValue settlementDelayDays")
      .populate("bankId", "name")
      .lean();
    return sendSuccessResponse({ res, status: 200, data: { payments: list }, message: "Payments retrieved successfully" });
  } catch (err) {
    console.error("Get payments by order error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to fetch payments" });
  }
};

export const listPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, orderId, paymentStatus } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = { isDeleted: { $ne: true } };
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) filter.orderId = orderId;
    if (paymentStatus && Object.values(PAYMENT_LIFECYCLE_STATUS).includes(paymentStatus)) filter.paymentStatus = paymentStatus;
    const [items, totalCount] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("orderId", "orderId clientName")
        .populate("mediatorId", "name commissionType commissionValue")
        .populate("bankId", "name")
        .lean(),
      Payment.countDocuments(filter),
    ]);
    return sendSuccessResponse({
      res,
      status: 200,
      data: { payments: items, totalCount, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalCount / limitNum) },
      message: "Payments retrieved successfully",
    });
  } catch (err) {
    console.error("List payments error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to list payments" });
  }
};

export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Invalid payment ID" });
    }
    const doc = await Payment.findByIdAndDelete(id);
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Payment not found" });
    }
    // Remove Income entries created from this credited payment
    return sendSuccessResponse({ res, status: 200, data: { _id: id }, message: "Payment deleted successfully" });
  } catch (err) {
    console.error("Delete payment error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to delete payment" });
  }
};

export const getCurrencyRate = async (req, res) => {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    const data = await response.json();
    const rate = data?.rates?.INR != null ? Number(data.rates.INR) : null;
    if (rate == null || isNaN(rate)) {
      return sendErrorResponse({ res, status: 502, message: "Could not fetch USD to INR rate" });
    }
    return sendSuccessResponse({
      res,
      status: 200,
      data: { usdToInr: Math.round(rate * 100) / 100 },
      message: "Currency rate retrieved",
    });
  } catch (err) {
    console.error("Currency rate error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to fetch currency rate" });
  }
};

export default {
  createPayment,
  updatePayment,
  getPaymentById,
  getPaymentsByOrderId,
  listPayments,
  deletePayment,
  getCurrencyRate,
};
