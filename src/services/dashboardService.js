/**
 * Dashboard Service — modular aggregation layer for tab-based dashboard.
 * Single source for overview, finance, orders, payments, profit analytics, partnership, operations.
 * Reuses payment lifecycle enums and orderProfitService where applicable.
 */

import Order from "../models/order.js";
import Payment from "../models/payment.js";
import ExpanseIncome from "../models/expance_inc.js";
import ManualBankEntry from "../models/manualBankEntry.js";
import Partner from "../models/partner.js";
import PartnerTransaction from "../models/partnerTransaction.js";
import Mediator from "../models/mediator.js";
import { PAYMENT_STATUS, PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";
import { getOrderProfitSummaryBulk } from "./orderProfitService.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Get start/end dates for filter (weekly, monthly, yearly). Default monthly. */
function getDateRange(filter = "monthly") {
  const end = new Date();
  const start = new Date();
  switch (filter) {
    case "weekly": {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "yearly":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      // monthly
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

/** Start of current week (Monday) for "credited this week" */
function getStartOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
export async function getOverview() {
  const startOfWeek = getStartOfWeek();
  const [
    totalOrdersResult,
    totalIncomeResult,
    totalExpenseResult,
    receivedPaymentResult,
    pendingPaymentResult,
    processingPaymentResult,
    pendingWithMediatorResult,
    processingAmountResult,
    creditedThisWeekResult,
    totalCommissionPaidResult,
    currencyGainLossResult,
  ] = await Promise.all([
    Order.countDocuments({ isDeleted: false }),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { $or: [{ type: "deposit" }, { type: "transfer" }] } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
    ]).then(([a, b]) => [{ totalIncome: (a[0]?.sum ?? 0) + (b[0]?.sum ?? 0) }]),
    ExpanseIncome.aggregate([
      { $match: { status: { $in: [PAYMENT_STATUS.PAID] }, isDeleted: { $ne: true } } },
      { $group: { _id: null, totalExpense: { $sum: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] } } } },
      { $project: { _id: 0, totalExpense: { $round: ["$totalExpense", 2] } } },
    ]).exec(),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { type: "deposit" } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
    ]).then(([a, b]) => [{ receivedPayment: (a[0]?.sum ?? 0) + (b[0]?.sum ?? 0) }]),
    Payment.aggregate([
      { $match: { paymentStatus: { $ne: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK }, isDeleted: { $ne: true } } },
      { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$expectedAmountINR", 0] }, 2] } } } },
      { $project: { _id: 0, pendingPayment: { $round: ["$sum", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING, isDeleted: { $ne: true } } },
      { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$expectedAmountINR", 0] }, 2] } } } },
      { $project: { _id: 0, processingPayment: { $round: ["$sum", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR, isDeleted: { $ne: true } } },
      { $group: { _id: null, amount: { $sum: { $round: ["$grossAmountUSD", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING, isDeleted: { $ne: true } } },
      { $group: { _id: null, amount: { $sum: { $round: ["$grossAmountUSD", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, creditedDate: { $gte: startOfWeek } } },
      { $group: { _id: null, amount: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
      { $group: { _id: null, totalUSD: { $sum: { $round: ["$mediatorCommissionAmount", 2] } } } },
      { $project: { _id: 0, totalUSD: { $round: ["$totalUSD", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, exchangeDifference: { $ne: null } } },
      { $group: { _id: null, totalDiff: { $sum: { $round: ["$exchangeDifference", 2] } }, gain: { $sum: { $cond: [{ $gte: ["$exchangeDifference", 0] }, { $round: ["$exchangeDifference", 2] }, 0] } }, loss: { $sum: { $cond: [{ $lt: ["$exchangeDifference", 0] }, { $abs: { $round: ["$exchangeDifference", 2] } }, 0] } } } },
      { $project: { _id: 0, totalDiff: { $round: ["$totalDiff", 2] }, gain: { $round: ["$gain", 2] }, loss: { $round: ["$loss", 2] } } },
    ]).exec(),
  ]);

  const totalOrders = totalOrdersResult || 0;
  const totalIncome = totalIncomeResult[0]?.totalIncome ?? 0;
  const totalExpense = totalExpenseResult[0]?.totalExpense ?? 0;
  const receivedPayment = receivedPaymentResult[0]?.receivedPayment ?? 0;
  const pendingPayment = pendingPaymentResult[0]?.pendingPayment ?? 0;
  const processingPayment = processingPaymentResult[0]?.processingPayment ?? 0;
  const pendingWithMediatorAmount = pendingWithMediatorResult[0]?.amount ?? 0;
  const processingAmount = processingAmountResult[0]?.amount ?? 0;
  const creditedThisWeek = creditedThisWeekResult[0]?.amount ?? 0;
  const totalCommissionPaid = totalCommissionPaidResult[0]?.totalUSD ?? 0;
  const currencyGainLoss = currencyGainLossResult[0] || { totalDiff: 0, gain: 0, loss: 0 };
  const netProfit = round2(totalIncome - totalExpense);
  const companyBalance = netProfit;

  return {
    totalOrders,
    totalIncome: round2(totalIncome),
    totalExpense: round2(totalExpense),
    netProfit,
    companyBalance,
    receivedPayment: round2(receivedPayment),
    pendingPayment: round2(pendingPayment),
    processingPayment: round2(processingPayment),
    pendingWithMediatorAmount: round2(pendingWithMediatorAmount),
    processingAmount: round2(processingAmount),
    creditedThisWeek: round2(creditedThisWeek),
    totalCommissionPaid: round2(totalCommissionPaid),
    currencyGainLossSummary: {
      totalDiff: round2(currencyGainLoss.totalDiff || 0),
      gain: round2(currencyGainLoss.gain || 0),
      loss: round2(currencyGainLoss.loss || 0),
    },
  };
}

// ---------------------------------------------------------------------------
// FINANCE
// ---------------------------------------------------------------------------
export async function getFinance(filter = "monthly") {
  const { start, end } = getDateRange(filter);
  const [
    expenseByCategory,
    cashflowBuckets,
    currencyGainLoss,
    commissionSummary,
    bankOverview,
  ] = await Promise.all([
    ExpanseIncome.aggregate([
      { $match: { status: PAYMENT_STATUS.PAID, isDeleted: { $ne: true }, date: { $gte: start, $lte: end } } },
      { $group: { _id: "$description", total: { $sum: { $round: ["$paidAmount", 2] } } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { category: "$_id", total: { $round: ["$total", 2] }, _id: 0 } },
    ]).exec(),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, creditedDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, in: { $sum: { $round: ["$actualBankCreditINR", 2] } } } },
        { $project: { _id: 0, in: { $round: ["$in", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: "$type", sum: { $sum: "$amount" } } },
      ]).exec(),
      ExpanseIncome.aggregate([
        { $match: { status: PAYMENT_STATUS.PAID, isDeleted: { $ne: true }, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, out: { $sum: { $round: ["$paidAmount", 2] } } } },
        { $project: { _id: 0, out: { $round: ["$out", 2] } } },
      ]).exec(),
    ]).then(([payRes, manualRes, expRes]) => {
      const inFlow = payRes[0]?.in ?? 0;
      let deposit = 0, withdrawal = 0, transfer = 0;
      (manualRes || []).forEach((r) => {
        if (r._id === "deposit") deposit = r.sum;
        else if (r._id === "withdrawal") withdrawal = r.sum;
        else if (r._id === "transfer") transfer = r.sum;
      });
      const outFlow = expRes[0]?.out ?? 0;
      return { creditedINR: inFlow, deposit, withdrawal, transfer, expenseOut: outFlow };
    }),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, exchangeDifference: { $ne: null } } },
      { $group: { _id: null, totalDiff: { $sum: { $round: ["$exchangeDifference", 2] } }, gain: { $sum: { $cond: [{ $gte: ["$exchangeDifference", 0] }, { $round: ["$exchangeDifference", 2] }, 0] } }, loss: { $sum: { $cond: [{ $lt: ["$exchangeDifference", 0] }, { $abs: { $round: ["$exchangeDifference", 2] } }, 0] } } } },
      { $project: { _id: 0, totalDiff: { $round: ["$totalDiff", 2] }, gain: { $round: ["$gain", 2] }, loss: { $round: ["$loss", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
      { $group: { _id: null, totalCommissionUSD: { $sum: { $round: ["$mediatorCommissionAmount", 2] } }, count: { $sum: 1 } } },
      { $project: { _id: 0, totalCommissionUSD: { $round: ["$totalCommissionUSD", 2] }, count: 1 } },
    ]).exec(),
    ManualBankEntry.aggregate([
      { $match: { type: "deposit" } },
      { $group: { _id: "$bankId", totalIn: { $sum: "$amount" } } },
    ]).exec().then(async (depositByBank) => {
      const withdrawalByBank = await ManualBankEntry.aggregate([
        { $match: { type: "withdrawal" } },
        { $group: { _id: "$bankId", totalOut: { $sum: "$amount" } } },
      ]).exec();
      const creditByBank = await Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, bankId: { $ne: null } } },
        { $group: { _id: "$bankId", credited: { $sum: { $round: ["$actualBankCreditINR", 2] } } } },
      ]).exec();
      const depositMap = new Map((depositByBank || []).map((r) => [String(r._id), r.totalIn || 0]));
      const withdrawalMap = new Map((withdrawalByBank || []).map((r) => [String(r._id), r.totalOut || 0]));
      const creditMap = new Map((creditByBank || []).map((r) => [String(r._id), r.credited || 0]));
      const bankIds = new Set([...depositMap.keys(), ...withdrawalMap.keys(), ...creditMap.keys()]);
      return Array.from(bankIds).map((bankId) => ({
        bankId,
        deposit: round2(depositMap.get(bankId) || 0),
        withdrawal: round2(withdrawalMap.get(bankId) || 0),
        credited: round2(creditMap.get(bankId) || 0),
      }));
    }),
  ]);

  return {
    expensePie: expenseByCategory || [],
    cashflow: cashflowBuckets || {},
    currencyGainLoss: currencyGainLoss[0] || { totalDiff: 0, gain: 0, loss: 0 },
    commissionSummary: commissionSummary[0] || { totalCommissionUSD: 0, count: 0 },
    bankOverview: bankOverview || [],
  };
}

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------
export async function getOrders(filter = "monthly") {
  const { start, end } = getDateRange(filter);
  const [
    orderTrend,
    statusDistribution,
    topCustomers,
    avgOrderValue,
    delayedOrders,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, _id: 0 } },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      { $group: { _id: "$clientName", count: { $sum: 1 }, totalSelling: { $sum: { $ifNull: ["$products.sellingPrice", 0] } } } },
      { $sort: { totalSelling: -1 } },
      { $limit: 10 },
      { $project: { customer: "$_id", orderCount: "$count", totalSelling: { $round: ["$totalSelling", 2] }, _id: 0 } },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      { $group: { _id: "$_id", orderTotal: { $sum: { $ifNull: ["$products.sellingPrice", 0] } } } },
      { $group: { _id: null, avg: { $avg: "$orderTotal" }, count: { $sum: 1 } } },
      { $project: { _id: 0, avgOrderValue: { $round: ["$avg", 2] }, orderCount: "$count" } },
    ]).exec(),
    Order.countDocuments({ isDeleted: false, status: "over_due" }),
  ]);

  const avgResult = avgOrderValue && avgOrderValue[0];
  const orderCountForPeriod = avgResult ? (avgResult.orderCount ?? 0) : 0;
  const avgVal = avgResult ? (avgResult.avgOrderValue ?? 0) : 0;
  return {
    orderTrend: orderTrend || [],
    statusDistribution: statusDistribution || [],
    topCustomers: topCustomers || [],
    avgOrderValue: avgVal,
    orderCount: orderCountForPeriod,
    delayedOrders: delayedOrders ?? 0,
  };
}

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------
export async function getPayments() {
  const startOfWeek = getStartOfWeek();
  const [
    pendingWithMediatorUSD,
    pendingWithMediatorINR,
    processingAgg,
    creditedThisWeek,
    mediatorWiseCommission,
    settlementDelay,
  ] = await Promise.all([
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR, isDeleted: { $ne: true } } },
      { $group: { _id: null, amount: { $sum: { $round: ["$grossAmountUSD", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR, isDeleted: { $ne: true } } },
      { $group: { _id: null, amount: { $sum: { $round: ["$expectedAmountINR", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING, isDeleted: { $ne: true } } },
      { $group: { _id: null, amountUSD: { $sum: { $round: ["$grossAmountUSD", 2] } }, amountINR: { $sum: { $round: ["$expectedAmountINR", 2] } } } },
      { $project: { _id: 0, amountUSD: { $round: ["$amountUSD", 2] }, amountINR: { $round: ["$amountINR", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, creditedDate: { $gte: startOfWeek } } },
      { $group: { _id: null, amount: { $sum: { $round: ["$actualBankCreditINR", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
      { $group: { _id: "$mediatorId", totalCommission: { $sum: { $round: ["$mediatorCommissionAmount", 2] } }, count: { $sum: 1 } } },
      { $lookup: { from: "mediators", localField: "_id", foreignField: "_id", as: "mediator" } },
      { $unwind: { path: "$mediator", preserveNullAndEmptyArrays: true } },
      { $project: { mediatorId: "$_id", mediatorName: "$mediator.name", totalCommission: { $round: ["$totalCommission", 2] }, count: 1, _id: 0 } },
    ]).exec(),
    Mediator.find({ isActive: true }).select("name settlementDelayDays").lean().exec(),
  ]);

  const proc = processingAgg[0];
  return {
    pendingWithMediatorUSD: round2(pendingWithMediatorUSD[0]?.amount ?? 0),
    pendingWithMediatorINR: round2(pendingWithMediatorINR[0]?.amount ?? 0),
    processingUSD: round2(proc?.amountUSD ?? 0),
    processingINR: round2(proc?.amountINR ?? 0),
    creditedThisWeek: round2(creditedThisWeek[0]?.amount ?? 0),
    mediatorWiseCommission: mediatorWiseCommission || [],
    settlementDelayTracking: (settlementDelay || []).map((m) => ({ name: m.name, settlementDelayDays: m.settlementDelayDays || 0 })),
  };
}

// ---------------------------------------------------------------------------
// PROFIT ANALYTICS (reuse orderProfitService formula)
// ---------------------------------------------------------------------------
export async function getProfitAnalytics(filter = "monthly") {
  const { start, end } = getDateRange(filter);
  const orderIds = await Order.find({ isDeleted: false, createdAt: { $gte: start, $lte: end } }).select("_id").lean().exec();
  const ids = (orderIds || []).map((o) => o._id);
  const profitMap = ids.length > 0 ? await getOrderProfitSummaryBulk(ids) : new Map();

  let totalNetProfit = 0;
  const costBreakdown = { purchasePrice: 0, supplierCost: 0, shippingCost: 0, packagingCost: 0, commissionINR: 0, otherExpenses: 0 };
  const orderProfits = [];

  for (const [orderIdStr, data] of profitMap) {
    totalNetProfit += data.netProfit || 0;
    orderProfits.push({ orderId: orderIdStr, netProfit: data.netProfit, totalActualINR: data.totalActualINR, totalExpenses: data.totalExpenses });
  }
  const sortedByProfit = [...orderProfits].sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0)).slice(0, 10);

  const commissionAgg = await Payment.aggregate([
    { $match: { orderId: { $in: ids }, paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: { $multiply: [{ $ifNull: ["$mediatorCommissionAmount", 0] }, { $ifNull: ["$conversionRate", 0] }] } } } },
    { $project: { _id: 0, total: { $round: ["$total", 2] } } },
  ]).exec();
  costBreakdown.commissionINR = commissionAgg[0]?.total ?? 0;

  const ordersWithPayments = await Order.find({ _id: { $in: ids } }).select("products shippingCost supplierCost packagingCost otherExpenses").lean();
  for (const order of ordersWithPayments || []) {
    costBreakdown.purchasePrice += order.products?.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0) || 0;
    costBreakdown.supplierCost += order.supplierCost || 0;
    costBreakdown.shippingCost += order.shippingCost || 0;
    costBreakdown.packagingCost += order.packagingCost || 0;
    costBreakdown.otherExpenses += order.otherExpenses || 0;
  }

  const totalBankCredit = Array.from(profitMap.values()).reduce((s, v) => s + (v.totalActualINR || 0), 0);

  return {
    totalNetProfit: round2(totalNetProfit),
    totalBankCredit: round2(totalBankCredit),
    costBreakdown: {
      purchasePrice: round2(costBreakdown.purchasePrice),
      supplierCost: round2(costBreakdown.supplierCost),
      shippingCost: round2(costBreakdown.shippingCost),
      packagingCost: round2(costBreakdown.packagingCost),
      commissionINR: round2(costBreakdown.commissionINR),
      otherExpenses: round2(costBreakdown.otherExpenses),
    },
    profitTrend: orderProfits.map((p) => ({ orderId: p.orderId, netProfit: round2(p.netProfit || 0) })),
    topProfitableOrders: sortedByProfit,
  };
}

// ---------------------------------------------------------------------------
// PARTNERSHIP
// ---------------------------------------------------------------------------
async function getPartnershipAggregates() {
  const [partners, invAgg, withAgg] = await Promise.all([
    Partner.find({ isActive: true }).select("name currentBalance totalInvested totalWithdrawn openingBalance").lean().exec(),
    PartnerTransaction.aggregate([
      { $match: { type: "investment" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
      { $project: { _id: 0, total: { $round: ["$total", 2] } } },
    ]).exec(),
    PartnerTransaction.aggregate([
      { $match: { type: "withdrawal" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
      { $project: { _id: 0, total: { $round: ["$total", 2] } } },
    ]).exec(),
  ]);
  const totalInvested = invAgg[0]?.total ?? 0;
  const totalWithdrawn = withAgg[0]?.total ?? 0;
  const totalCapital = (partners || []).reduce((s, p) => s + (p.currentBalance || 0), 0);
  return {
    capitalSummary: { totalCapital: round2(totalCapital), totalInvested: round2(totalInvested), totalWithdrawn: round2(totalWithdrawn) },
    contributionBreakdown: (partners || []).map((p) => ({
      name: p.name,
      currentBalance: round2(p.currentBalance || 0),
      totalInvested: round2(p.totalInvested || 0),
      totalWithdrawn: round2(p.totalWithdrawn || 0),
    })),
    withdrawals: round2(totalWithdrawn),
    capitalGrowth: round2(totalCapital),
  };
}

// ---------------------------------------------------------------------------
// OPERATIONS (order flow funnel, no inventory model — use order status pipeline)
// ---------------------------------------------------------------------------
export async function getOperations() {
  const [orderFlowFunnel, statusPipeline] = await Promise.all([
    Order.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: "$products" },
      { $group: { _id: "$status", productCount: { $sum: 1 } } },
      { $project: { status: "$_id", productCount: 1, _id: 0 } },
    ]).exec(),
  ]);

  return {
    productionPipeline: statusPipeline || [],
    orderFlowFunnel: orderFlowFunnel || [],
    inventoryLowStock: [], // No inventory model in codebase
    inventoryValueTrend: [],
  };
}

// ---------------------------------------------------------------------------
// MAIN: get dashboard by requested tabs
// ---------------------------------------------------------------------------
const TAB_FNS = {
  overview: getOverview,
  finance: getFinance,
  orders: getOrders,
  payments: getPayments,
  profitAnalytics: getProfitAnalytics,
  partnership: () => getPartnershipAggregates(),
  operations: getOperations,
};

export async function getDashboard(tabs = null, filter = "monthly") {
  const keys = tabs && Array.isArray(tabs) && tabs.length > 0 ? tabs : Object.keys(TAB_FNS);
  const result = {};
  await Promise.all(
    keys.map(async (key) => {
      if (!TAB_FNS[key]) return;
      try {
        result[key] = await TAB_FNS[key](filter);
      } catch (err) {
        console.error(`Dashboard tab ${key} error:`, err);
        result[key] = null;
      }
    })
  );
  return result;
}

export default {
  getOverview,
  getFinance,
  getOrders,
  getPayments,
  getProfitAnalytics,
  getPartnership: getPartnershipAggregates,
  getOperations,
  getDashboard,
  getDateRange,
};
