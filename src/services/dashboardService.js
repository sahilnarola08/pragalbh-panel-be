/**
 * Dashboard Service — modular aggregation layer for tab-based dashboard.
 * Single source for overview, finance, orders, payments, profit analytics, partnership, operations.
 * Reuses payment lifecycle enums and orderProfitService where applicable.
 */

import mongoose from "mongoose";
import Order from "../models/order.js";
import Payment from "../models/payment.js";
import ExpanseIncome from "../models/expance_inc.js";
import ManualBankEntry from "../models/manualBankEntry.js";
import Master from "../models/master.js";
import Partner from "../models/partner.js";
import PartnerTransaction from "../models/partnerTransaction.js";
import Mediator from "../models/mediator.js";
import { PAYMENT_STATUS, PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";
import { getOrderProfitSummaryBulk } from "./orderProfitService.js";
import { findActiveTargetByType, getActualSales } from "./targetService.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Match paid expense rows (excludes internal transfer mirror rows). */
function expensePaidMatch(start, end) {
  return {
    status: PAYMENT_STATUS.PAID,
    isDeleted: { $ne: true },
    manualType: { $ne: "transfer" },
    date: { $gte: start, $lte: end },
  };
}

/**
 * Aggregation expression: human-readable bucket for expense tracking
 * (extra expense category, salary, order components, order COGS, then “order misc”).
 */
function expenseCategoryLabelExpr() {
  return {
    $let: {
      vars: {
        ecn: { $trim: { input: { $ifNull: ["$extraCategoryName", ""] } } },
      },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: "$$ecn" }, 0] },
          "$$ecn",
          {
            $switch: {
              branches: [{ case: { $eq: ["$expenseSourceType", "SALARY"] }, then: "Salary" }],
              default: {
                $cond: [
                  { $and: [{ $ne: [{ $type: "$orderId" }, "missing"] }, { $ne: ["$orderId", null] }] },
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$isOrderProductPurchase", true] },
                          then: "Order · Product / COGS",
                        },
                        {
                          case: { $eq: ["$componentType", "shipping"] },
                          then: "Order · Shipping",
                        },
                        {
                          case: { $eq: ["$componentType", "packaging"] },
                          then: "Order · Packaging",
                        },
                        {
                          case: { $eq: ["$componentType", "other"] },
                          then: "Order · Other component",
                        },
                      ],
                      default: "Order · Supplier & misc.",
                    },
                  },
                  "General / standalone",
                ],
              },
            },
          },
        ],
      },
    },
  };
}

/** Group smart categories and fold the tail into "Other categories" for readable charts. */
function foldCategoryTotals(rows, topN) {
  const clean = (rows || [])
    .map((r) => ({
      category: r._id == null || r._id === "" ? "Uncategorized" : String(r._id),
      total: round2(Number(r.total) || 0),
    }))
    .filter((r) => r.total > 0);
  if (clean.length <= topN + 1) return clean;
  const head = clean.slice(0, topN);
  const tailSum = round2(clean.slice(topN).reduce((s, r) => s + r.total, 0));
  if (tailSum > 0) head.push({ category: "Other categories", total: tailSum });
  return head;
}

/** Get start/end dates for filter (weekly, monthly, yearly, custom). Default monthly. */
function getDateRange(filter = "monthly", options = {}) {
  const end = new Date();
  const start = new Date();
  const parsedCustomStart = options?.startDate ? new Date(options.startDate) : null;
  const parsedCustomEnd = options?.endDate ? new Date(options.endDate) : null;
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
    case "custom":
      if (parsedCustomStart instanceof Date && !Number.isNaN(parsedCustomStart.getTime())) {
        start.setTime(parsedCustomStart.getTime());
      } else {
        start.setDate(1);
      }
      if (parsedCustomEnd instanceof Date && !Number.isNaN(parsedCustomEnd.getTime())) {
        end.setTime(parsedCustomEnd.getTime());
      }
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

/** Inclusive calendar days between range bounds (UTC midnight safe for dashboards). */
function inclusiveDayCount(start, end) {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
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
export async function getOverview(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
  const orderDateMatch = { createdAt: { $gte: start, $lte: end } };
  const paymentCreatedMatch = { createdAt: { $gte: start, $lte: end } };
  const paymentCreditedMatch = { creditedDate: { $gte: start, $lte: end } };
  const expenseDateMatch = { date: { $gte: start, $lte: end } };
  const manualDateMatch = { date: { $gte: start, $lte: end } };
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
    expenseCategoryOverviewAgg,
  ] = await Promise.all([
    Order.countDocuments({ isDeleted: false, ...orderDateMatch }),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, ...paymentCreditedMatch } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { isDeleted: { $ne: true }, ...manualDateMatch, type: "deposit" } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
    ]).then(([a, b]) => [{ totalIncome: (a[0]?.sum ?? 0) + (b[0]?.sum ?? 0) }]),
    ExpanseIncome.aggregate([
      { $match: { status: { $in: [PAYMENT_STATUS.PAID] }, isDeleted: { $ne: true }, manualType: { $ne: "transfer" }, ...expenseDateMatch } },
      { $group: { _id: null, totalExpense: { $sum: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] } } } },
      { $project: { _id: 0, totalExpense: { $round: ["$totalExpense", 2] } } },
    ]).exec(),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, ...paymentCreditedMatch } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { type: "deposit", isDeleted: { $ne: true }, ...manualDateMatch } },
        { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] } } } },
        { $project: { _id: 0, sum: { $round: ["$sum", 2] } } },
      ]).exec(),
    ]).then(([a, b]) => [{ receivedPayment: (a[0]?.sum ?? 0) + (b[0]?.sum ?? 0) }]),
    Payment.aggregate([
      { $match: { paymentStatus: { $ne: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK }, isDeleted: { $ne: true }, ...paymentCreatedMatch } },
      { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$expectedAmountINR", 0] }, 2] } } } },
      { $project: { _id: 0, pendingPayment: { $round: ["$sum", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING, isDeleted: { $ne: true }, ...paymentCreatedMatch } },
      { $group: { _id: null, sum: { $sum: { $round: [{ $ifNull: ["$expectedAmountINR", 0] }, 2] } } } },
      { $project: { _id: 0, processingPayment: { $round: ["$sum", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR, isDeleted: { $ne: true }, ...paymentCreatedMatch } },
      { $group: { _id: null, amount: { $sum: { $round: ["$grossAmountUSD", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING, isDeleted: { $ne: true }, ...paymentCreatedMatch } },
      { $group: { _id: null, amount: { $sum: { $round: ["$grossAmountUSD", 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, ...paymentCreditedMatch } },
      { $group: { _id: null, amount: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } } } },
      { $project: { _id: 0, amount: { $round: ["$amount", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, ...paymentCreditedMatch } },
      { $group: { _id: null, totalUSD: { $sum: { $round: ["$mediatorCommissionAmount", 2] } } } },
      { $project: { _id: 0, totalUSD: { $round: ["$totalUSD", 2] } } },
    ]).exec(),
    Payment.aggregate([
      { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, exchangeDifference: { $ne: null }, ...paymentCreditedMatch } },
      { $group: { _id: null, totalDiff: { $sum: { $round: ["$exchangeDifference", 2] } }, gain: { $sum: { $cond: [{ $gte: ["$exchangeDifference", 0] }, { $round: ["$exchangeDifference", 2] }, 0] } }, loss: { $sum: { $cond: [{ $lt: ["$exchangeDifference", 0] }, { $abs: { $round: ["$exchangeDifference", 2] } }, 0] } } } },
      { $project: { _id: 0, totalDiff: { $round: ["$totalDiff", 2] }, gain: { $round: ["$gain", 2] }, loss: { $round: ["$loss", 2] } } },
    ]).exec(),
    ExpanseIncome.aggregate([
      { $match: expensePaidMatch(start, end) },
      { $addFields: { expenseCategoryLabel: expenseCategoryLabelExpr() } },
      { $group: { _id: "$expenseCategoryLabel", total: { $sum: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] } } } },
      { $sort: { total: -1 } },
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
  const periodDays = inclusiveDayCount(start, end);
  const topExpenseCategories = foldCategoryTotals(expenseCategoryOverviewAgg || [], 5);
  const expenseAvgDaily = round2((totalExpense || 0) / periodDays);

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
    topExpenseCategories,
    expensePeriodDays: periodDays,
    expenseAvgDaily,
  };
}

// ---------------------------------------------------------------------------
// FINANCE
// ---------------------------------------------------------------------------
export async function getFinance(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
  const [
    expenseByCategory,
    expenseSmartBuckets,
    expenseDailySeries,
    cashflowBuckets,
    currencyGainLoss,
    commissionSummary,
    bankOverview,
  ] = await Promise.all([
    ExpanseIncome.aggregate([
      { $match: expensePaidMatch(start, end) },
      { $group: { _id: "$description", total: { $sum: { $round: ["$paidAmount", 2] } } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { category: "$_id", total: { $round: ["$total", 2] }, _id: 0 } },
    ]).exec(),
    ExpanseIncome.aggregate([
      { $match: expensePaidMatch(start, end) },
      { $addFields: { expenseCategoryLabel: expenseCategoryLabelExpr() } },
      { $group: { _id: "$expenseCategoryLabel", total: { $sum: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] } } } },
      { $sort: { total: -1 } },
    ]).exec(),
    ExpanseIncome.aggregate([
      { $match: expensePaidMatch(start, end) },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          total: { $sum: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", total: { $round: ["$total", 2] }, _id: 0 } },
    ]).exec(),
    Promise.all([
      Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, creditedDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, in: { $sum: { $round: ["$actualBankCreditINR", 2] } } } },
        { $project: { _id: 0, in: { $round: ["$in", 2] } } },
      ]).exec(),
      ManualBankEntry.aggregate([
        { $match: { date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
        { $group: { _id: "$type", sum: { $sum: "$amount" } } },
      ]).exec(),
      ExpanseIncome.aggregate([
        { $match: expensePaidMatch(start, end) },
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
      { $match: { type: "deposit", isDeleted: { $ne: true } } },
      { $group: { _id: "$bankId", totalIn: { $sum: "$amount" } } },
    ]).exec().then(async (depositByBank) => {
      const withdrawalByBank = await ManualBankEntry.aggregate([
        { $match: { type: "withdrawal", isDeleted: { $ne: true } } },
        { $group: { _id: "$bankId", totalOut: { $sum: "$amount" } } },
      ]).exec();
      const transferOutByBank = await ManualBankEntry.aggregate([
        { $match: { type: "transfer", isDeleted: { $ne: true } } },
        { $group: { _id: "$bankId", transferOut: { $sum: { $ifNull: ["$fromAmount", "$amount"] } } } },
      ]).exec();
      const transferInByBank = await ManualBankEntry.aggregate([
        { $match: { type: "transfer", isDeleted: { $ne: true }, toBankId: { $ne: null } } },
        { $group: { _id: "$toBankId", transferIn: { $sum: { $ifNull: ["$toAmount", "$amount"] } } } },
      ]).exec();
      const creditByBank = await Payment.aggregate([
        { $match: { paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK, isDeleted: { $ne: true }, bankId: { $ne: null } } },
        { $group: { _id: "$bankId", credited: { $sum: { $round: ["$actualBankCreditINR", 2] } } } },
      ]).exec();
      const depositMap = new Map((depositByBank || []).map((r) => [String(r._id), r.totalIn || 0]));
      const withdrawalMap = new Map((withdrawalByBank || []).map((r) => [String(r._id), r.totalOut || 0]));
      const transferOutMap = new Map((transferOutByBank || []).map((r) => [String(r._id), r.transferOut || 0]));
      const transferInMap = new Map((transferInByBank || []).map((r) => [String(r._id), r.transferIn || 0]));
      const creditMap = new Map((creditByBank || []).map((r) => [String(r._id), r.credited || 0]));
      const bankIds = new Set([
        ...depositMap.keys(),
        ...withdrawalMap.keys(),
        ...transferOutMap.keys(),
        ...transferInMap.keys(),
        ...creditMap.keys(),
      ]);
      const idList = Array.from(bankIds).filter(
        (id) => id && mongoose.Types.ObjectId.isValid(String(id))
      );
      const oidList = idList.map((id) => new mongoose.Types.ObjectId(String(id)));
      const masters =
        oidList.length > 0
          ? await Master.find({ _id: { $in: oidList } })
              .select("name")
              .lean()
              .exec()
          : [];
      const bankNameMap = new Map((masters || []).map((m) => [String(m._id), (m.name || "").trim() || "Bank"]));

      return Array.from(bankIds).map((bankId) => {
        const key = bankId != null ? String(bankId) : "";
        const named = key && mongoose.Types.ObjectId.isValid(key) ? bankNameMap.get(key) : null;
        const bankName =
          named ||
          (key === "" || key === "null" || key === "undefined"
            ? "Unassigned bank"
            : mongoose.Types.ObjectId.isValid(key)
              ? `Unknown bank (${key.slice(-6)})`
              : `Invalid ref (${String(key).slice(0, 12)}…)`);
        return {
          bankId: key || null,
          bankName,
          deposit: round2(depositMap.get(bankId) || 0),
          withdrawal: round2(withdrawalMap.get(bankId) || 0),
          transferOut: round2(transferOutMap.get(bankId) || 0),
          transferIn: round2(transferInMap.get(bankId) || 0),
          credited: round2(creditMap.get(bankId) || 0),
        };
      });
    }),
  ]);

  const cf = cashflowBuckets || {};
  const periodDays = inclusiveDayCount(start, end);
  const expenseDaily = (expenseDailySeries || []).map((r) => ({
    date: r.date,
    total: round2(Number(r.total) || 0),
  }));
  let peakDay = null;
  let peakAmount = 0;
  for (const row of expenseDaily) {
    if (row.total > peakAmount) {
      peakAmount = row.total;
      peakDay = row.date;
    }
  }
  const expenseTracking = {
    totalExpense: round2(cf.expenseOut ?? 0),
    calendarDays: periodDays,
    avgDaily: round2((cf.expenseOut || 0) / periodDays),
    peakDay,
    peakAmount: round2(peakAmount),
    activeSpendDays: expenseDaily.filter((x) => x.total > 0).length,
  };

  return {
    expensePie: expenseByCategory || [],
    expenseByCategory: foldCategoryTotals(expenseSmartBuckets || [], 10),
    expenseDaily,
    expenseTracking,
    cashflow: cf,
    currencyGainLoss: currencyGainLoss[0] || { totalDiff: 0, gain: 0, loss: 0 },
    commissionSummary: commissionSummary[0] || { totalCommissionUSD: 0, count: 0 },
    bankOverview: bankOverview || [],
  };
}

/** Calendar month bounds (month is 0-indexed). */
function getCalendarMonthRange(year, month) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

async function aggregatePeriodSales(start, end) {
  const [salesAgg, orderCount] = await Promise.all([
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalSales: { $sum: { $ifNull: ["$products.sellingPrice", 0] } },
        },
      },
      { $project: { _id: 0, totalSales: { $round: ["$totalSales", 2] } } },
    ]).exec(),
    Order.countDocuments({ isDeleted: false, createdAt: { $gte: start, $lte: end } }),
  ]);
  return {
    totalSales: round2(salesAgg[0]?.totalSales ?? 0),
    orderCount: orderCount || 0,
  };
}

// ---------------------------------------------------------------------------
// SALES
// ---------------------------------------------------------------------------
export async function getSales(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
  const now = new Date();
  const curMonth = getCalendarMonthRange(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = getCalendarMonthRange(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const trendFormat = filter === "yearly" ? "%Y-%m" : "%Y-%m-%d";
  const monthBuckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    });
  }

  const monthlySalesPromises = monthBuckets.map(async (b) => {
    const r = getCalendarMonthRange(b.year, b.month);
    const total = await getActualSales(r.start, r.end);
    return { label: b.label, sales: round2(total), year: b.year, month: b.month };
  });

  const [
    currentMonthData,
    lastMonthData,
    periodData,
    salesTrend,
    salesByStatus,
    monthlyComparison,
  ] = await Promise.all([
    aggregatePeriodSales(curMonth.start, curMonth.end),
    aggregatePeriodSales(lastMonth.start, lastMonth.end),
    aggregatePeriodSales(start, end),
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      {
        $group: {
          _id: { $dateToString: { format: trendFormat, date: "$createdAt" } },
          sales: { $sum: { $ifNull: ["$products.sellingPrice", 0] } },
          orders: { $addToSet: "$_id" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          sales: { $round: ["$sales", 2] },
          orderCount: { $size: "$orders" },
          _id: 0,
        },
      },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$status",
          sales: { $sum: { $ifNull: ["$products.sellingPrice", 0] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { sales: -1 } },
      { $project: { status: "$_id", sales: { $round: ["$sales", 2] }, count: 1, _id: 0 } },
    ]).exec(),
    Promise.all(monthlySalesPromises),
  ]);

  const currentMonthSales = currentMonthData.totalSales;
  const lastMonthSales = lastMonthData.totalSales;
  const monthOverMonthChange =
    lastMonthSales > 0
      ? round2(((currentMonthSales - lastMonthSales) / lastMonthSales) * 100)
      : currentMonthSales > 0
        ? 100
        : 0;

  const filterLabels = {
    weekly: "This Week",
    monthly: "This Month",
    yearly: "This Year",
    custom: "Custom Range",
  };

  return {
    currentMonth: {
      sales: currentMonthSales,
      orderCount: currentMonthData.orderCount,
      label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      startDate: curMonth.start.toISOString(),
      endDate: curMonth.end.toISOString(),
    },
    lastMonth: {
      sales: lastMonthSales,
      orderCount: lastMonthData.orderCount,
      label: lastMonthDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      startDate: lastMonth.start.toISOString(),
      endDate: lastMonth.end.toISOString(),
    },
    monthOverMonthChange,
    period: {
      sales: periodData.totalSales,
      orderCount: periodData.orderCount,
      filter,
      filterLabel: filterLabels[filter] || filterLabels.monthly,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      avgOrderValue:
        periodData.orderCount > 0 ? round2(periodData.totalSales / periodData.orderCount) : 0,
    },
    salesTrend: salesTrend || [],
    monthlyComparison: monthlyComparison || [],
    salesByStatus: salesByStatus || [],
  };
}

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------
export async function getOrders(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
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
const PAYMENTS_TARGET_FILTER_MAP = {
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
};

async function getPaymentTargetCreditsVsSales(filter) {
  const targetKey = PAYMENTS_TARGET_FILTER_MAP[filter];
  if (!targetKey) return null;
  const targetDoc = await findActiveTargetByType(targetKey);
  if (!targetDoc) return null;
  const ts = new Date(targetDoc.startDate);
  ts.setHours(0, 0, 0, 0);
  const te = new Date(targetDoc.endDate);
  te.setHours(23, 59, 59, 999);
  const creditedAgg = await Payment.aggregate([
    {
      $match: {
        paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
        isDeleted: { $ne: true },
        creditedDate: { $gte: ts, $lte: te },
      },
    },
    {
      $group: {
        _id: null,
        amountINR: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } },
      },
    },
    { $project: { _id: 0, amountINR: { $round: ["$amountINR", 2] } } },
  ]).exec();
  const creditedINR = creditedAgg[0]?.amountINR ?? 0;
  const tgt = Number(targetDoc.salesTargetAmount) || 0;
  return {
    targetType: targetKey,
    salesTargetAmount: round2(tgt),
    creditedINRForTargetPeriod: round2(creditedINR),
    pctCreditedVsSalesTarget: tgt > 0 ? round2((creditedINR / tgt) * 100) : 0,
    targetPeriodStart: targetDoc.startDate,
    targetPeriodEnd: targetDoc.endDate,
  };
}

export async function getPayments(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
  const facetGroup = () => ({
    count: { $sum: 1 },
    amountUSD: { $sum: { $round: [{ $ifNull: ["$grossAmountUSD", 0] }, 2] } },
    amountINR: { $sum: { $round: [{ $ifNull: ["$expectedAmountINR", 0] }, 2] } },
  });

  const [
    lifecycleFacet,
    mediatorWiseCommission,
    settlementDelay,
    creditedDaily,
    targetCreditsComparison,
  ] = await Promise.all([
    Payment.aggregate([
      {
        $facet: {
          pending: [
            {
              $match: {
                paymentStatus: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR,
                isDeleted: { $ne: true },
                createdAt: { $gte: start, $lte: end },
              },
            },
            { $group: { _id: null, ...facetGroup() } },
            {
              $project: {
                _id: 0,
                count: { $ifNull: ["$count", 0] },
                amountUSD: { $round: ["$amountUSD", 2] },
                amountINR: { $round: ["$amountINR", 2] },
              },
            },
          ],
          processing: [
            {
              $match: {
                paymentStatus: PAYMENT_LIFECYCLE_STATUS.PROCESSING,
                isDeleted: { $ne: true },
                createdAt: { $gte: start, $lte: end },
              },
            },
            { $group: { _id: null, ...facetGroup() } },
            {
              $project: {
                _id: 0,
                count: { $ifNull: ["$count", 0] },
                amountUSD: { $round: ["$amountUSD", 2] },
                amountINR: { $round: ["$amountINR", 2] },
              },
            },
          ],
          credited: [
            {
              $match: {
                paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
                isDeleted: { $ne: true },
                creditedDate: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                amountUSD: { $sum: { $round: [{ $ifNull: ["$grossAmountUSD", 0] }, 2] } },
                amountINR: {
                  $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] },
                },
              },
            },
            {
              $project: {
                _id: 0,
                count: { $ifNull: ["$count", 0] },
                amountUSD: { $round: ["$amountUSD", 2] },
                amountINR: { $round: ["$amountINR", 2] },
              },
            },
          ],
        },
      },
    ]).exec(),
    Payment.aggregate([
      {
        $match: {
          paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
          isDeleted: { $ne: true },
          creditedDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$mediatorId",
          totalCommission: { $sum: { $round: ["$mediatorCommissionAmount", 2] } },
          count: { $sum: 1 },
        },
      },
      { $lookup: { from: "mediators", localField: "_id", foreignField: "_id", as: "mediator" } },
      { $unwind: { path: "$mediator", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          mediatorId: "$_id",
          mediatorName: "$mediator.name",
          totalCommission: { $round: ["$totalCommission", 2] },
          count: 1,
          _id: 0,
        },
      },
    ]).exec(),
    Mediator.find({ isActive: true }).select("name settlementDelayDays").lean().exec(),
    Payment.aggregate([
      {
        $match: {
          paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
          isDeleted: { $ne: true },
          creditedDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$creditedDate" } },
          totalINR: { $sum: { $round: [{ $ifNull: ["$actualBankCreditINR", 0] }, 2] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", totalINR: { $round: ["$totalINR", 2] }, _id: 0 } },
    ]).exec(),
    getPaymentTargetCreditsVsSales(filter),
  ]);

  const pend = lifecycleFacet?.[0]?.pending?.[0];
  const proc = lifecycleFacet?.[0]?.processing?.[0];
  const credit = lifecycleFacet?.[0]?.credited?.[0];

  const lifecycleBreakdown = [
    {
      key: PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR,
      label: "Pending with mediator",
      count: pend?.count ?? 0,
      amountUSD: round2(pend?.amountUSD ?? 0),
      amountINR: round2(pend?.amountINR ?? 0),
    },
    {
      key: PAYMENT_LIFECYCLE_STATUS.PROCESSING,
      label: "Processing",
      count: proc?.count ?? 0,
      amountUSD: round2(proc?.amountUSD ?? 0),
      amountINR: round2(proc?.amountINR ?? 0),
    },
    {
      key: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
      label: "Credited to bank",
      count: credit?.count ?? 0,
      amountUSD: round2(credit?.amountUSD ?? 0),
      amountINR: round2(credit?.amountINR ?? 0),
    },
  ];

  const pipelineINR = round2((pend?.amountINR ?? 0) + (proc?.amountINR ?? 0));
  const creditedINRPeriod = round2(credit?.amountINR ?? 0);
  const exposedINR = round2(pipelineINR + creditedINRPeriod);
  const realizationRatePct =
    exposedINR > 0 ? round2((creditedINRPeriod / exposedINR) * 100) : 0;

  return {
    pendingWithMediatorUSD: round2(pend?.amountUSD ?? 0),
    pendingWithMediatorINR: round2(pend?.amountINR ?? 0),
    processingUSD: round2(proc?.amountUSD ?? 0),
    processingINR: round2(proc?.amountINR ?? 0),
    creditedThisWeek: creditedINRPeriod,
    mediatorWiseCommission: mediatorWiseCommission || [],
    settlementDelayTracking: (settlementDelay || []).map((m) => ({
      name: m.name,
      settlementDelayDays: m.settlementDelayDays || 0,
    })),
    lifecycleBreakdown,
    creditedDailyINR: (creditedDaily || []).map((r) => ({
      date: r.date,
      totalINR: round2(Number(r.totalINR) || 0),
    })),
    collectionSummary: {
      creditedINR: creditedINRPeriod,
      pipelineExpectedINR: pipelineINR,
      totalExposureINR: exposedINR,
      realizationRatePct,
      creditedCount: credit?.count ?? 0,
      pipelineCount: (pend?.count ?? 0) + (proc?.count ?? 0),
    },
    targetCreditsComparison,
  };
}

// ---------------------------------------------------------------------------
// PROFIT ANALYTICS (reuse orderProfitService formula)
// ---------------------------------------------------------------------------
export async function getProfitAnalytics(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
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
export async function getOperations(filter = "monthly", options = {}) {
  const { start, end } = getDateRange(filter, options);
  const [orderFlowFunnel, statusPipeline] = await Promise.all([
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ]).exec(),
    Order.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
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
  sales: getSales,
  finance: getFinance,
  orders: getOrders,
  payments: getPayments,
  profitAnalytics: getProfitAnalytics,
  partnership: () => getPartnershipAggregates(),
  operations: getOperations,
};

export async function getDashboard(tabs = null, filter = "monthly", options = {}) {
  const keys = tabs && Array.isArray(tabs) && tabs.length > 0 ? tabs : Object.keys(TAB_FNS);
  const result = {};
  await Promise.all(
    keys.map(async (key) => {
      if (!TAB_FNS[key]) return;
      try {
        result[key] = await TAB_FNS[key](filter, options);
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
  getSales,
  getFinance,
  getOrders,
  getPayments,
  getProfitAnalytics,
  getPartnership: getPartnershipAggregates,
  getOperations,
  getDashboard,
  getDateRange,
};
