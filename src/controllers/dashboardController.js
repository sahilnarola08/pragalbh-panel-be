import Order from "../models/order.js";
import Income from "../models/income.js";
import ExpanseIncome from "../models/expance_inc.js";
import { PAYMENT_STATUS } from "../helper/enums.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

// Get Dashboard Statistics
export const getDashboardStats = async (req, res) => {
  try {
    // Run all queries in parallel for maximum speed
    const [
      totalOrdersResult,
      totalIncomeResult,
      totalExpenseResult,
      receivedPaymentResult,
      pendingPaymentResult,
      processingPaymentResult
    ] = await Promise.all([
      // 1. Total Order Count
      Order.countDocuments({}),

      // 2. Total Income (sum of all receivedAmount)
      Income.aggregate([
        {
          $group: {
            _id: null,
            totalIncome: {
              $sum: {
                $round: [{ $ifNull: ["$receivedAmount", 0] }, 2]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalIncome: { $round: ["$totalIncome", 2] }
          }
        }
      ]).exec(),

      // 3. Total Expense (sum of all paidAmount with paid status)
      ExpanseIncome.aggregate([
        {
          $match: {
            status: { $in: [PAYMENT_STATUS.PAID] }
          }
        },
        {
          $group: {
            _id: null,
            totalExpense: {
              $sum: {
                $round: [{ $ifNull: ["$paidAmount", 0] }, 2]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalExpense: { $round: ["$totalExpense", 2] }
          }
        }
      ]).exec(),

      // 4. Received Payment (sum of receivedAmount where status is 'reserved')
      Income.aggregate([
        {
          $match: {
            status: { $in: [PAYMENT_STATUS.RESERVED] }
          }
        },
        {
          $group: {
            _id: null,
            receivedPayment: {
              $sum: {
                $round: [{ $ifNull: ["$receivedAmount", 0] }, 2]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            receivedPayment: { $round: ["$receivedPayment", 2] }
          }
        }
      ]).exec(),

      // 5. Pending Payment (sum of (sellingPrice - receivedAmount) where status is 'pending')
      Income.aggregate([
        {
          $match: {
            status: { $in: [PAYMENT_STATUS.PENDING] }
          }
        },
        {
          $group: {
            _id: null,
            pendingPayment: {
              $sum: {
                $round: [
                  {
                    $subtract: [
                      { $ifNull: ["$sellingPrice", 0] },
                      { $ifNull: ["$receivedAmount", 0] }
                    ]
                  },
                  2
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            pendingPayment: { $round: ["$pendingPayment", 2] }
          }
        }
      ]).exec(),

      // 6. Processing Payment (sum of all mediatorAmount amounts)
      Income.aggregate([
        {
          $unwind: {
            path: "$mediatorAmount",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: null,
            processingPayment: {
              $sum: {
                $round: [{ $ifNull: ["$mediatorAmount.amount", 0] }, 2]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            processingPayment: { $round: ["$processingPayment", 2] }
          }
        }
      ]).exec()
    ]);

    // Extract values from aggregation results
    const totalOrders = totalOrdersResult || 0;
    const totalIncome = totalIncomeResult[0]?.totalIncome || 0;
    const totalExpense = totalExpenseResult[0]?.totalExpense || 0;
    const receivedPayment = receivedPaymentResult[0]?.receivedPayment || 0;
    const pendingPayment = pendingPaymentResult[0]?.pendingPayment || 0;
    const processingPayment = processingPaymentResult[0]?.processingPayment || 0;

    // Calculate Net Profit (Total Income - Total Expense)
    const netProfit = Math.round((totalIncome - totalExpense) * 100) / 100;

    // Prepare response data
    const dashboardData = {
      totalOrders: totalOrders,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: netProfit,
      receivedPayment: Math.round(receivedPayment * 100) / 100,
      pendingPayment: Math.round(pendingPayment * 100) / 100,
      processingPayment: Math.round(processingPayment * 100) / 100
    };

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return sendSuccessResponse({
      res,
      status: 200,
      data: dashboardData,
      message: "Dashboard statistics retrieved successfully"
    });

  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

export default {
  getDashboardStats
};

