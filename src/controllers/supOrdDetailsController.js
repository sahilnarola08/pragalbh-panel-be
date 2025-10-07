import { PAYMENT_STATUS } from "../helper/enums.js";
import ExpanceIncome from "../models/expance_inc.js";
import Supplier from "../models/supplier.js";
import mongoose from "mongoose";

export const getSupplierOrderDetails = async (req, res) => {
  try {
    const supplierId = req.params.id.trim();
    const {
      page = 1,
      limit = 10,
      sortField = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortField] = sortOrder === "asc" ? 1 : -1;

    // Get total count of records
    const totalCount = await ExpanceIncome.countDocuments({
      supplierId: supplierId,
    });

    // find all expense/income records for given supplier with pagination
    const supplierExpanseData = await ExpanceIncome.find({
      supplierId: supplierId,
    })
      .populate("supplierId", "firstName lastName email phone advancePayment")
      .populate("orderId", "product orderDate dispatchDate orderId purchasePrice")
      .sort(sortObj)
      .skip(offset)
      .limit(limitNum)
      .lean();

    if (!supplierExpanseData || supplierExpanseData.length === 0) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "No expense records found for this supplier",
      });
    }

    // extract supplier details from first record
    const supplierInfo = supplierExpanseData[0].supplierId;

    // Calculate totals from ALL records (not just paginated ones)
    const allExpenseData = await ExpanceIncome.find({
      supplierId: supplierId,
    })
      .populate("orderId", "purchasePrice")
      .lean();

    const purchaseTotal = allExpenseData.reduce((sum, item) => {
      return sum + (item.orderId?.purchasePrice || 0);
    }, 0);

    const dueTotal = allExpenseData.reduce((sum, item) => {
      // If dueAmount is set, use it; otherwise fall back to purchasePrice for old records
      const due = (item.dueAmount !== undefined && item.dueAmount !== null) 
        ? item.dueAmount 
        : (item.orderId?.purchasePrice || 0);
      return sum + due;
    }, 0);

    // Calculate total advance payment (handle both array and number formats)
    let totalBalance = 0;
    if (Array.isArray(supplierInfo?.advancePayment)) {
      totalBalance = supplierInfo.advancePayment.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    } else {
      totalBalance = supplierInfo?.advancePayment || 0;
    }

    const formattedData = supplierExpanseData.map((item) => ({
      _id: item._id,
      orderId: item.orderId,
      paidAmount: item.paidAmount,
      purchasePrice: item.orderId?.purchasePrice || 0,
      dueAmount: (item.dueAmount !== undefined && item.dueAmount !== null) 
        ? item.dueAmount 
        : (item.orderId?.purchasePrice || 0),
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Supplier expenses fetched successfully",
      data: {
        supplierName: `${supplierInfo?.firstName} ${supplierInfo?.lastName}` || "Unknown Supplier",
        supplierId: supplierInfo?._id,
        orders: formattedData,
        totalCount: totalCount,
        page: pageNum,
        limit: limitNum,
        totals: {
          totalBalance,
          purchaseTotal,
          dueTotal,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching supplier expense details:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Mark Payment as Done
export const markPaymentDone = async (req, res) => {
  try {
    const { expenseId, supplierId, bankId } = req.body;

    // Validate required fields
    if (!expenseId || !supplierId || !bankId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "expenseId, supplierId, and bankId are required",
      });
    }

    // Find the expense record
    const expense = await ExpanceIncome.findById(expenseId);
    if (!expense) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Expense record not found",
      });
    }

    // Check if payment is already paid
    if (expense.status === PAYMENT_STATUS.PAID || expense.status === PAYMENT_STATUS.DONE) {
      return res.status(201).json({
        success: false,
        status: 201,
        message: "Payment is already checked/paid",
      });
    }

    // Find the supplier
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Supplier not found",
      });
    }

    // Ensure advancePayment is an array
    if (!Array.isArray(supplier.advancePayment)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Supplier advance payment data is invalid",
      });
    }

    // Find the bank payment entry
    const bankPaymentIndex = supplier.advancePayment.findIndex(
      (payment) => payment.bankId.toString() === bankId.toString()
    );

    if (bankPaymentIndex === -1) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Bank payment entry not found for this supplier",
      });
    }

    const bankPayment = supplier.advancePayment[bankPaymentIndex];
    const dueAmount = expense.dueAmount || 0;

    // Check if bank balance is sufficient
    if (bankPayment.amount < dueAmount) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: `Insufficient balance. Required: ${dueAmount}, Available: ${bankPayment.amount}`,
      });
    }

    // Deduct dueAmount from bank's advance payment
    supplier.advancePayment[bankPaymentIndex].amount -= dueAmount;
    const remainingBalance = supplier.advancePayment[bankPaymentIndex].amount;

    // Remove the bank entry if amount becomes 0
    if (supplier.advancePayment[bankPaymentIndex].amount === 0) {
      supplier.advancePayment.splice(bankPaymentIndex, 1);
    }

    await supplier.save();

    // Update expense record
    expense.paidAmount = dueAmount;
    expense.dueAmount = 0;
    expense.status = PAYMENT_STATUS.PAID;
    await expense.save();

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Payment marked as paid successfully",
      data: {
        expense,
        remainingBalance: remainingBalance,
      },
    });
  } catch (error) {
    console.error("Error marking payment as done:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default { getSupplierOrderDetails, markPaymentDone };
