import * as dashboardService from "../services/dashboardService.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

/**
 * GET /dashboard?tab=overview&filter=monthly
 * Returns { overview, finance, orders, payments, profitAnalytics, partnership, operations }.
 * If tab is provided, only that tab is computed (and returned as the only key with data).
 * If multiple tabs: tab=overview&tab=payments returns both.
 */
export const getDashboard = async (req, res) => {
  try {
    const tab = req.query.tab;
    const filter = req.query.filter || "monthly";
    const tabs = tab ? (Array.isArray(tab) ? tab : [tab]) : null;
    const data = await dashboardService.getDashboard(tabs, filter);

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return sendSuccessResponse({
      res,
      status: 200,
      data,
      message: "Dashboard data retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /dashboard/data — legacy flat stats (backward compatibility).
 * Maps overview to previous response shape.
 */
export const getDashboardStats = async (req, res) => {
  try {
    const overview = await dashboardService.getOverview();

    const dashboardData = {
      totalOrders: overview.totalOrders,
      totalIncome: overview.totalIncome,
      totalExpense: overview.totalExpense,
      netProfit: overview.netProfit,
      companyBalance: overview.companyBalance,
      receivedPayment: overview.receivedPayment,
      pendingPayment: overview.pendingPayment,
      processingPayment: overview.processingPayment,
      pendingWithMediatorAmount: overview.pendingWithMediatorAmount,
      processingAmount: overview.processingAmount,
      creditedThisWeek: overview.creditedThisWeek,
      totalCommissionPaid: overview.totalCommissionPaid,
      currencyGainLossSummary: overview.currencyGainLossSummary,
    };

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return sendSuccessResponse({
      res,
      status: 200,
      data: dashboardData,
      message: "Dashboard statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default {
  getDashboard,
  getDashboardStats,
};
