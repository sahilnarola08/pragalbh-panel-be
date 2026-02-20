import Order from "../models/order.js";
import Payment from "../models/payment.js";
import ExpanseIncome from "../models/expance_inc.js";
import { PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";
import mongoose from "mongoose";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Get profit breakdown for an order.
 * Total Final Bank Credit INR = sum of actualBankCreditINR for payments with status credited_to_bank.
 * Purchase price = sum of order.products[].purchasePrice (included in expenses).
 * Net Profit = Total Bank Credit INR - purchasePrice - supplierCost - shippingCost - packagingCost - totalCommissionINR - otherExpenses.
 * Commission INR = sum(mediatorCommissionAmount USD * conversionRate) for credited payments.
 */
export const getOrderProfitSummary = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return null;
  }
  const order = await Order.findById(orderId).lean();
  if (!order) return null;

  const [creditedPayments, allPayments] = await Promise.all([
    Payment.find({
      orderId: new mongoose.Types.ObjectId(orderId),
      paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
      isDeleted: { $ne: true },
    }).lean(),
    Payment.find({
      orderId: new mongoose.Types.ObjectId(orderId),
      isDeleted: { $ne: true },
    }).lean(),
  ]);

  const payments = creditedPayments;
  const purchasePrice = Array.isArray(order.products)
    ? round2(order.products.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0))
    : 0;
  const supplierCost = round2(order.supplierCost ?? 0);
  const shippingCost = round2(order.shippingCost ?? 0);
  const packagingCost = round2(order.packagingCost ?? 0);
  const otherExpenses = round2(order.otherExpenses ?? 0);

  let totalFinalBankCreditINR = 0;
  let totalCommissionINR = 0;
  let totalCommissionUSD = 0;
  let totalExchangeDifference = 0;
  let totalGrossUSD = 0;
  let totalNetUSD = 0;
  let totalExpectedINR = 0;

  for (const p of payments) {
    const actual = p.actualBankCreditINR != null ? round2(p.actualBankCreditINR) : 0;
    totalFinalBankCreditINR += actual;
    const rate = round2(p.conversionRate || 0);
    const commissionUSD = round2(p.mediatorCommissionAmount || 0);
    totalCommissionUSD += commissionUSD;
    totalCommissionINR += round2(commissionUSD * rate);
    totalExchangeDifference += round2(p.exchangeDifference || 0);
    totalGrossUSD += round2(p.grossAmountUSD || 0);
    totalNetUSD += round2(p.netAmountUSD || 0);
    totalExpectedINR += round2(p.expectedAmountINR || 0);
  }

  // Total expected INR from ALL payment slots (including pending_with_mediator, processing) for modal "estimated profit"
  let totalExpectedINRAllPayments = 0;
  for (const p of allPayments) {
    totalExpectedINRAllPayments += round2(p.expectedAmountINR || 0);
  }

  const totalExpenses = round2(purchasePrice + supplierCost + shippingCost + packagingCost + totalCommissionINR + otherExpenses);
  const netProfit = round2(totalFinalBankCreditINR - totalExpenses);
  const sellingTotal = Array.isArray(order.products)
    ? round2(order.products.reduce((s, p) => s + (p.sellingPrice || 0), 0))
    : 0;
  const profitPercent = sellingTotal > 0 ? round2((netProfit / sellingTotal) * 100) : 0;

  return {
    orderId: order._id,
    orderOrderId: order.orderId,
    grossUSD: totalGrossUSD,
    commissionDeductedUSD: totalCommissionUSD,
    netUSD: totalNetUSD,
    totalExpectedINR: totalExpectedINRAllPayments || totalExpectedINR,
    totalActualINR: totalFinalBankCreditINR,
    exchangeDifference: totalExchangeDifference,
    purchasePrice,
    supplierCost,
    shippingCost,
    packagingCost,
    otherExpenses,
    totalCommissionINR: round2(totalCommissionINR),
    totalExpenses,
    netProfit,
    sellingTotal,
    profitPercent,
    paymentsCount: payments.length,
  };
};

/**
 * Get order expenses from ExpanseIncome (legacy) for display. Does not change profit calc above.
 */
export const getOrderExpenseEntries = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return [];
  const list = await ExpanseIncome.find({ orderId, isDeleted: { $ne: true } }).sort({ date: 1, createdAt: 1 }).lean();
  return list;
};

/**
 * Bulk: get net profit and payment status per order (for order list).
 * Returns Map<orderIdStr, { netProfit, totalActualINR, totalExpenses, paymentStatus }>.
 * paymentStatus: "Paid" when (1) all payments credited to bank, OR (2) customer has paid in full
 * (total gross USD / expected INR from all payment slots >= order selling) but payment is still
 * in mediator or processing. "Partial" when some payment exists; otherwise "Unpaid".
 */
export const getOrderProfitSummaryBulk = async (orderIds) => {
  if (!orderIds || orderIds.length === 0) return new Map();
  const ids = orderIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) return new Map();

  const [creditedAgg, allPaymentsAgg, expectedAgg, totalGrossUSDAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { orderId: { $in: ids }, paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: "$orderId",
          totalActualINR: { $sum: { $ifNull: ["$actualBankCreditINR", 0] } },
          totalExpectedINR: { $sum: { $ifNull: ["$expectedAmountINR", 0] } },
          totalCommissionINR: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$mediatorCommissionAmount", null] }, { $ne: ["$conversionRate", null] }] },
                { $multiply: ["$mediatorCommissionAmount", "$conversionRate"] },
                0,
              ],
            },
          },
          creditedCount: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { orderId: { $in: ids }, isDeleted: { $ne: true } } },
      { $group: { _id: "$orderId", totalCount: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { orderId: { $in: ids }, isDeleted: { $ne: true } } },
      { $group: { _id: "$orderId", totalExpectedINR: { $sum: { $ifNull: ["$expectedAmountINR", 0] } } } },
    ]),
    // Total gross USD from ALL payments (any status: pending_with_mediator, processing, credited_to_bank) for "full payment by customer" check
    Payment.aggregate([
      { $match: { orderId: { $in: ids }, isDeleted: { $ne: true } } },
      { $group: { _id: "$orderId", totalGrossUSD: { $sum: { $ifNull: ["$grossAmountUSD", 0] } } } },
    ]),
  ]);

  const paymentMap = new Map();
  creditedAgg.forEach((row) => {
    const idStr = row._id ? String(row._id) : "";
    if (!idStr) return;
    paymentMap.set(idStr, {
      totalActualINR: round2(row.totalActualINR || 0),
      totalExpectedINR: round2(row.totalExpectedINR || 0),
      totalCommissionINR: round2(row.totalCommissionINR || 0),
      creditedCount: row.creditedCount || 0,
    });
  });
  const allPaymentsMap = new Map();
  allPaymentsAgg.forEach((row) => {
    const idStr = row._id ? String(row._id) : "";
    if (idStr) allPaymentsMap.set(idStr, row.totalCount || 0);
  });
  const totalExpectedMap = new Map();
  expectedAgg.forEach((row) => {
    const idStr = row._id ? String(row._id) : "";
    if (idStr) totalExpectedMap.set(idStr, round2(row.totalExpectedINR || 0));
  });
  const totalGrossUSDMap = new Map();
  totalGrossUSDAgg.forEach((row) => {
    const idStr = row._id ? String(row._id) : "";
    if (idStr) totalGrossUSDMap.set(idStr, round2(row.totalGrossUSD || 0));
  });

  const orders = await Order.find({ _id: { $in: ids } }).select("products shippingCost supplierCost packagingCost otherExpenses").lean();
  const result = new Map();
  orders.forEach((order) => {
    const orderIdStr = order._id ? String(order._id) : "";
    const pay = paymentMap.get(orderIdStr) || { totalActualINR: 0, totalExpectedINR: 0, totalCommissionINR: 0, creditedCount: 0 };
    const totalPaymentsCount = allPaymentsMap.get(orderIdStr) || 0;
    const totalExpectedINR = totalExpectedMap.get(orderIdStr) ?? pay.totalExpectedINR ?? 0;
    const totalGrossUSD = totalGrossUSDMap.get(orderIdStr) ?? 0;
    const purchasePrice = Array.isArray(order.products)
      ? round2(order.products.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0))
      : 0;
    const supplierCost = round2(order.supplierCost ?? 0);
    const shippingCost = round2(order.shippingCost ?? 0);
    const packagingCost = round2(order.packagingCost ?? 0);
    const otherExpenses = round2(order.otherExpenses ?? 0);
    const totalExpenses = round2(purchasePrice + supplierCost + shippingCost + packagingCost + pay.totalCommissionINR + otherExpenses);
    const netProfit = round2(pay.totalActualINR - totalExpenses);
    const estimatedProfit = round2(totalExpectedINR - totalExpenses);
    // Order total selling: USD and INR (from products)
    let orderSellingUSD = 0;
    let orderSellingINR = 0;
    if (Array.isArray(order.products)) {
      order.products.forEach((p) => {
        const price = Number(p.sellingPrice) || 0;
        const currency = (p.paymentCurrency || "INR").toUpperCase();
        if (currency === "USD") orderSellingUSD += price;
        else orderSellingINR += price;
      });
      orderSellingUSD = round2(orderSellingUSD);
      orderSellingINR = round2(orderSellingINR);
    }
    // Paid when: (1) all payments credited to bank, OR (2) customer has paid in full but payment is in mediator/processing (total gross/expected >= selling)
    let paymentStatus = "Unpaid";
    const allCredited = totalPaymentsCount > 0 && pay.creditedCount === totalPaymentsCount;
    const usdCovered = orderSellingUSD <= 0 || totalGrossUSD >= orderSellingUSD - 0.01;
    const inrCovered = orderSellingINR <= 0 || totalExpectedINR >= orderSellingINR - 0.01;
    const fullPaidInTransit = totalPaymentsCount > 0 && usdCovered && inrCovered;
    if (allCredited || fullPaidInTransit) {
      paymentStatus = "Paid";
    } else if (pay.creditedCount > 0 || totalGrossUSD > 0 || totalExpectedINR > 0) {
      paymentStatus = "Partial";
    }
    result.set(orderIdStr, { netProfit, totalActualINR: pay.totalActualINR, totalExpenses, totalExpectedINR, estimatedProfit, paymentStatus });
  });
  return result;
};

export default { getOrderProfitSummary, getOrderExpenseEntries, getOrderProfitSummaryBulk };
