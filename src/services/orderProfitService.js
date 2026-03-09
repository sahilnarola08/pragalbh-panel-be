import Order from "../models/order.js";
import Payment from "../models/payment.js";
import ExpanseIncome from "../models/expance_inc.js";
import { PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";
import mongoose from "mongoose";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// We need selling totals in INR for profit, but some products store sellingPrice in USD.
// Frontend converts USD->INR using a live rate; we mirror that with a small in-memory cache.
let _usdToInrCache = { rate: null, fetchedAtMs: 0 };
const USD_TO_INR_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getUsdToInrRate() {
  const now = Date.now();
  if (_usdToInrCache.rate && now - _usdToInrCache.fetchedAtMs < USD_TO_INR_CACHE_TTL_MS) {
    return _usdToInrCache.rate;
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    const data = await res.json();
    const rate = Number(data?.rates?.INR);
    if (rate && Number.isFinite(rate) && rate > 0) {
      _usdToInrCache = { rate, fetchedAtMs: now };
      return rate;
    }
  } catch (e) {
    // ignore; fallback below
  }
  return _usdToInrCache.rate || 1;
}

function getOrderSellingTotalINR(order, usdToInrRate = 1) {
  if (Array.isArray(order?.products) && order.products.length) {
    return round2(
      order.products.reduce((sum, p) => {
        const price = Number(p?.sellingPrice) || 0;
        const currency = String(p?.paymentCurrency || "INR").toUpperCase();
        const inr = currency === "USD" ? price * usdToInrRate : price;
        return sum + (Number.isFinite(inr) ? inr : 0);
      }, 0)
    );
  }
  // legacy: assume INR
  return round2(order?.sellingPrice || 0);
}

/**
 * Get profit breakdown for an order.
 * Total Final Bank Credit INR = sum of actualBankCreditINR for payments with status credited_to_bank.
 * Purchase price = sum of order.products[].purchasePrice (included in expenses).
 * Net Profit = Total Bank Credit INR - purchasePrice - supplierCost - shippingCost - packagingCost - otherExpenses.
 * Note: expected/actual INR already represent NET amounts (after mediator commission),
 * so commission is displayed but not subtracted again in expenses.
 */
export const getOrderProfitSummary = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return null;
  }
  const order = await Order.findById(orderId).lean();
  if (!order) return null;

  const usdToInrRate = await getUsdToInrRate();

  // If order is deleted, include deleted payments/expenses. If active, exclude them.
  const paymentFilter = {
    orderId: new mongoose.Types.ObjectId(orderId),
  };
  const expenseFilter = {
    orderId: new mongoose.Types.ObjectId(orderId),
  };

  if (!order.isDeleted) {
    paymentFilter.isDeleted = { $ne: true };
    expenseFilter.isDeleted = { $ne: true };
  }

  const [creditedPayments, allPayments] = await Promise.all([
    Payment.find({
      ...paymentFilter,
      paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
    }).lean(),
    Payment.find(paymentFilter).lean(),
  ]);

  // Fetch expense entries (Money paid/expense)
  const expenseEntries = await ExpanseIncome.find(expenseFilter).lean();

  // Sum up all additional expenses from ExpanseIncome (we use paidAmount only for profit)
  let totalExpanseIncome = 0;
  for (const exp of expenseEntries) {
    totalExpanseIncome += round2(exp.paidAmount || 0);
  }

  const payments = creditedPayments;
  const purchasePrice = Array.isArray(order.products)
    ? round2(order.products.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0))
    : 0;
  const supplierCost = round2(order.supplierCost ?? 0);
  const shippingCost = round2(order.shippingCost ?? 0);
  const packagingCost = round2(order.packagingCost ?? 0);
  const otherExpenses = round2(order.otherExpenses ?? 0);

  // ExpanseIncome can include purchase payments (paidAmount) and extra expenses. We already
  // count purchase via order.products[].purchasePrice, so only add the excess to avoid double-counting.
  const additionalExpenses = round2(Math.max(0, totalExpanseIncome - purchasePrice));

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

  const totalExpenses = round2(
    purchasePrice +
      additionalExpenses +
      supplierCost +
      shippingCost +
      packagingCost +
      otherExpenses
  );
  const netProfit = round2(totalFinalBankCreditINR - totalExpenses);
  const sellingTotal = getOrderSellingTotalINR(order, usdToInrRate);
  const profitPercent = sellingTotal > 0 ? round2((netProfit / sellingTotal) * 100) : 0;
  // Estimated profit uses configured selling price until full amount is credited to bank.
  const estimatedProfit = round2(sellingTotal - totalExpenses);
  const fullyCreditedToBank =
    (totalExpectedINRAllPayments || totalExpectedINR) <= 0
      ? totalFinalBankCreditINR > 0
      : totalFinalBankCreditINR >= (totalExpectedINRAllPayments || totalExpectedINR) - 0.01;

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
    estimatedProfit,
    fullyCreditedToBank,
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
  
  // Check if order is deleted
  const order = await Order.findById(orderId).select("isDeleted").lean();
  if (!order) return [];

  const filter = { orderId };
  if (!order.isDeleted) {
    filter.isDeleted = { $ne: true };
  }

  const list = await ExpanseIncome.find(filter).sort({ date: 1, createdAt: 1 }).lean();
  return list;
};

/**
 * Bulk: get net profit and payment status per order (for order list).
 * Returns Map<orderIdStr, { netProfit, totalActualINR, totalExpenses, paymentStatus, fullyCreditedToBank }>.
 * paymentStatus: "Paid" only when full order amount is covered (total gross USD and expected INR
 * from payment slots >= order selling). If only partial amount is received (e.g. $300 of $675),
 * status is "Partial". "Paid" can be (1) all payment slots credited and amount covers selling,
 * or (2) customer has paid in full but payment is in mediator/processing.
 * fullyCreditedToBank: true only when amount received covers order selling (so frontend shows exact net profit; otherwise shows "Est.").
 */
export const getOrderProfitSummaryBulk = async (orderIds) => {
  if (!orderIds || orderIds.length === 0) return new Map();
  const ids = orderIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) return new Map();

  const usdToInrRate = await getUsdToInrRate();

  // Fetch orders first to check isDeleted status and get product details
  const orders = await Order.find({ _id: { $in: ids } })
    .select("products shippingCost supplierCost packagingCost otherExpenses isDeleted")
    .lean();

  const activeIds = [];
  const deletedIds = [];
  orders.forEach((o) => {
    if (o.isDeleted) deletedIds.push(o._id);
    else activeIds.push(o._id);
  });

  // Helper to run aggregations for a set of IDs with optional isDeleted filter
  const runAggregations = async (targetIds, filterDeleted = true) => {
    if (targetIds.length === 0) return [[], [], [], [], []];

    const matchBase = { orderId: { $in: targetIds } };
    if (filterDeleted) matchBase.isDeleted = { $ne: true };

    return Promise.all([
      Payment.aggregate([
        { $match: { ...matchBase, paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK } },
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
        { $match: matchBase },
        { $group: { _id: "$orderId", totalCount: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: matchBase },
        { $group: { _id: "$orderId", totalExpectedINR: { $sum: { $ifNull: ["$expectedAmountINR", 0] } } } },
      ]),
      // Total gross USD from ALL payments (any status: pending_with_mediator, processing, credited_to_bank) for "full payment by customer" check
      Payment.aggregate([
        { $match: matchBase },
        { $group: { _id: "$orderId", totalGrossUSD: { $sum: { $ifNull: ["$grossAmountUSD", 0] } } } },
      ]),
      // Aggregate ExpanseIncome
      ExpanseIncome.aggregate([
        { $match: matchBase },
        { $group: { _id: "$orderId", totalExpanseIncome: { $sum: { $ifNull: ["$paidAmount", 0] } } } },
      ]),
    ]);
  };

  const [
    [activeCredited, activeAll, activeExpected, activeGross, activeExpense],
    [deletedCredited, deletedAll, deletedExpected, deletedGross, deletedExpense],
  ] = await Promise.all([runAggregations(activeIds, true), runAggregations(deletedIds, false)]);

  // Merge results
  const creditedAgg = [...activeCredited, ...deletedCredited];
  const allPaymentsAgg = [...activeAll, ...deletedAll];
  const expectedAgg = [...activeExpected, ...deletedExpected];
  const totalGrossUSDAgg = [...activeGross, ...deletedGross];
  const expanseIncomeAgg = [...activeExpense, ...deletedExpense];

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
  const expanseIncomeMap = new Map();
  expanseIncomeAgg.forEach((row) => {
    const idStr = row._id ? String(row._id) : "";
    if (idStr) expanseIncomeMap.set(idStr, round2(row.totalExpanseIncome || 0));
  });

  const result = new Map();
  orders.forEach((order) => {
    const orderIdStr = order._id ? String(order._id) : "";
    const pay = paymentMap.get(orderIdStr) || { totalActualINR: 0, totalExpectedINR: 0, totalCommissionINR: 0, creditedCount: 0 };
    const totalPaymentsCount = allPaymentsMap.get(orderIdStr) || 0;
    const totalExpectedINR = totalExpectedMap.get(orderIdStr) ?? pay.totalExpectedINR ?? 0;
    const totalGrossUSD = totalGrossUSDMap.get(orderIdStr) ?? 0;
    const totalExpanseIncome = expanseIncomeMap.get(orderIdStr) ?? 0;

    const purchasePrice = Array.isArray(order.products)
      ? round2(order.products.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0))
      : 0;
    const supplierCost = round2(order.supplierCost ?? 0);
    const shippingCost = round2(order.shippingCost ?? 0);
    const packagingCost = round2(order.packagingCost ?? 0);
    const otherExpenses = round2(order.otherExpenses ?? 0);

    // ExpanseIncome can include purchase payments; avoid double-counting with order.products purchasePrice.
    const additionalExpenses = round2(Math.max(0, totalExpanseIncome - purchasePrice));
    const totalExpenses = round2(
      purchasePrice +
        additionalExpenses +
        supplierCost +
        shippingCost +
        packagingCost +
        otherExpenses
    );
    const netProfit = round2(pay.totalActualINR - totalExpenses);
    const sellingTotal = getOrderSellingTotalINR(order, usdToInrRate);
    const estimatedProfit = round2(sellingTotal - totalExpenses);
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
    // Paid only when full order amount is covered (by credited payments or payments in transit).
    // Partial payment (e.g. $300 of $675) must show as "Partial", not "Paid".
    const usdCovered = orderSellingUSD <= 0 || totalGrossUSD >= orderSellingUSD - 0.01;
    const inrCovered = orderSellingINR <= 0 || totalExpectedINR >= orderSellingINR - 0.01;
    const allCredited = totalPaymentsCount > 0 && pay.creditedCount === totalPaymentsCount;
    const fullPaidInTransit = totalPaymentsCount > 0 && usdCovered && inrCovered;
    const fullAmountCovered = usdCovered && inrCovered;

    let paymentStatus = "Unpaid";
    if ((allCredited && fullAmountCovered) || fullPaidInTransit) {
      paymentStatus = "Paid";
    } else if (pay.creditedCount > 0 || totalGrossUSD > 0 || totalExpectedINR > 0) {
      paymentStatus = "Partial";
    }

    // Exact net profit only when full amount received and credited; otherwise frontend shows estimated.
    const receivedCoversExpected =
      totalExpectedINR <= 0 ? pay.totalActualINR > 0 : pay.totalActualINR >= totalExpectedINR - 0.01;
    const fullyCreditedToBank = receivedCoversExpected && fullAmountCovered;
    result.set(orderIdStr, {
      netProfit,
      totalActualINR: pay.totalActualINR,
      totalExpenses,
      totalExpectedINR,
      estimatedProfit,
      paymentStatus,
      fullyCreditedToBank,
    });
  });
  return result;
};

export default { getOrderProfitSummary, getOrderExpenseEntries, getOrderProfitSummaryBulk };
