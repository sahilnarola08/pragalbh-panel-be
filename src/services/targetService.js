import Order from "../models/order.js";
import Income from "../models/income.js";
import ExpanseIncome from "../models/expance_inc.js";
import Target from "../models/target.js";
import { PAYMENT_STATUS } from "../helper/enums.js";

const TARGET_TYPES = ["weekly", "monthly", "yearly"];

function getPeriodBounds(type, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  const totalDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
  let currentDay = 0;
  if (now >= start && now <= end) {
    currentDay = Math.ceil((now - start) / (24 * 60 * 60 * 1000)) + 1;
  } else if (now > end) {
    currentDay = totalDays;
  }
  return { start, end, totalDays, currentDay, now };
}

function getExpectedProgress(totalDays, currentDay) {
  if (totalDays <= 0) return 0;
  return Math.min(1, currentDay / totalDays);
}

function getStatus(actual, expected, thresholdSlightlyBehind = 0.9) {
  if (expected <= 0) return "On Track";
  const ratio = actual / expected;
  if (ratio >= 1) return "On Track";
  if (ratio >= thresholdSlightlyBehind) return "Slightly Behind";
  return "Behind";
}

export async function getActualSales(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const result = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        isDeleted: { $ne: true },
      },
    },
    {
      $unwind: "$products",
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$products.sellingPrice", 0] } },
      },
    },
    { $project: { _id: 0, total: { $round: ["$total", 2] } } },
  ]).exec();
  return result[0]?.total ?? 0;
}

export async function getActualProfit(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const [incomeResult, expenseResult] = await Promise.all([
    Income.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$receivedAmount", 0] } } } },
      { $project: { _id: 0, total: { $round: ["$total", 2] } } },
    ]).exec(),
    ExpanseIncome.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          status: PAYMENT_STATUS.PAID,
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$paidAmount", 0] } } } },
      { $project: { _id: 0, total: { $round: ["$total", 2] } } },
    ]).exec(),
  ]);
  const totalIncome = incomeResult[0]?.total ?? 0;
  const totalExpense = expenseResult[0]?.total ?? 0;
  return Math.round((totalIncome - totalExpense) * 100) / 100;
}

export async function getDashboardSummary(type, targetDoc) {
  if (!targetDoc) {
    return {
      target: null,
      actualSales: 0,
      actualProfit: 0,
      salesProgressPercentage: 0,
      profitProgressPercentage: 0,
      salesStatus: "On Track",
      profitStatus: "On Track",
      remainingSales: 0,
      remainingProfit: 0,
      expectedSalesTillToday: 0,
      expectedProfitTillToday: 0,
      totalDays: 0,
      currentDay: 0,
      requiredPerDaySales: 0,
      requiredPerDayProfit: 0,
    };
  }

  const { startDate, endDate, salesTargetAmount, profitTargetAmount } = targetDoc;
  const bounds = getPeriodBounds(type, startDate, endDate);
  const { start, end, totalDays, currentDay } = bounds;

  const [actualSales, actualProfit] = await Promise.all([
    getActualSales(start, end),
    getActualProfit(start, end),
  ]);

  const expectedProgress = getExpectedProgress(totalDays, currentDay);
  const expectedSalesTillToday = Math.round((salesTargetAmount * expectedProgress) * 100) / 100;
  const expectedProfitTillToday = Math.round((profitTargetAmount * expectedProgress) * 100) / 100;

  const salesStatus = getStatus(actualSales, expectedSalesTillToday);
  const profitStatus = getStatus(actualProfit, expectedProfitTillToday);

  const salesProgressPercentage =
    salesTargetAmount > 0 ? Math.min(100, Math.round((actualSales / salesTargetAmount) * 10000) / 100) : 0;
  const profitProgressPercentage =
    profitTargetAmount > 0 ? Math.round((actualProfit / profitTargetAmount) * 10000) / 100 : 0;

  const remainingSales = Math.max(0, Math.round((salesTargetAmount - actualSales) * 100) / 100);
  const remainingProfit = Math.round((profitTargetAmount - actualProfit) * 100) / 100;

  const daysLeft = Math.max(0, totalDays - currentDay);
  const requiredPerDaySales = daysLeft > 0 ? Math.round((remainingSales / daysLeft) * 100) / 100 : 0;
  const requiredPerDayProfit = daysLeft > 0 ? Math.round((remainingProfit / daysLeft) * 100) / 100 : 0;

  const target = {
    id: targetDoc._id.toString(),
    type: targetDoc.type,
    salesTargetAmount: targetDoc.salesTargetAmount,
    profitTargetAmount: targetDoc.profitTargetAmount,
    startDate: targetDoc.startDate,
    endDate: targetDoc.endDate,
    isActive: targetDoc.isActive,
  };

  return {
    target,
    actualSales,
    actualProfit,
    salesProgressPercentage,
    profitProgressPercentage,
    salesStatus,
    profitStatus,
    remainingSales,
    remainingProfit,
    expectedSalesTillToday,
    expectedProfitTillToday,
    totalDays,
    currentDay,
    requiredPerDaySales,
    requiredPerDayProfit,
  };
}

export async function findActiveTargetByType(type) {
  if (!TARGET_TYPES.includes(type)) return null;
  return Target.findOne({ type, isActive: true }).sort({ createdAt: -1 }).lean().exec();
}

export async function createTarget(body, userId) {
  const { type, salesTargetAmount, profitTargetAmount, startDate, endDate } = body;
  const existing = await Target.findOne({ type, isActive: true });
  if (existing) {
    await Target.findByIdAndUpdate(existing._id, { isActive: false });
  }
  const doc = await Target.create({
    type,
    salesTargetAmount,
    profitTargetAmount,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    isActive: true,
    createdBy: userId || undefined,
  });
  return doc;
}

export async function updateTarget(id, body, userId) {
  const doc = await Target.findById(id);
  if (!doc) return null;
  const { type, salesTargetAmount, profitTargetAmount, startDate, endDate, isActive } = body;
  if (type !== undefined) doc.type = type;
  if (salesTargetAmount !== undefined) doc.salesTargetAmount = salesTargetAmount;
  if (profitTargetAmount !== undefined) doc.profitTargetAmount = profitTargetAmount;
  if (startDate !== undefined) doc.startDate = new Date(startDate);
  if (endDate !== undefined) doc.endDate = new Date(endDate);
  if (isActive !== undefined) {
    doc.isActive = isActive;
    if (isActive) {
      await Target.updateMany({ type: doc.type, _id: { $ne: doc._id } }, { isActive: false });
    }
  }
  await doc.save();
  return doc;
}

export async function listTargets(query) {
  const { type } = query || {};
  const filter = type ? { type } : {};
  return Target.find(filter).sort({ createdAt: -1 }).lean().exec();
}

export async function getTargetById(id) {
  return Target.findById(id).lean().exec();
}
