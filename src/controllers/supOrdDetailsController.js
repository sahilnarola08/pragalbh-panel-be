import { PAYMENT_STATUS } from "../helper/enums.js";
import { formatCurrency } from "../util/currencyFormat.js";
import ExpanceIncome from "../models/expance_inc.js";
import Supplier from "../models/supplier.js";
import Master from "../models/master.js";
import mongoose from "mongoose";
// normalize object id or throw error
const normalizeObjectIdOrThrow = (value, fieldName) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`${fieldName} must be a valid ObjectId`);
    error.status = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(value);
};

// normalize bank id or throw error
const normalizeBankIdOrThrow = async (bankId) => {
  const normalized = normalizeObjectIdOrThrow(bankId, "bankId");

  const bank = await Master.findOne({
    _id: normalized,
    isDeleted: false,
  }).select("_id name");

  if (!bank) {
    const error = new Error("Bank not found or is inactive");
    error.status = 404;
    throw error;
  }

  return bank._id;
};

// build bank response
const buildBankResponse = (bank) => {
  if (!bank || typeof bank !== "object") {
    return { bankId: null, bank: null };
  }
  const bankId = bank._id ? bank._id : bank;
  const bankInfo =
    bank && typeof bank === "object" && bank.name
      ? { _id: bankId, name: bank.name }
      : null;
  return { bankId, bank: bankInfo };
};

export const getSupplierOrderDetails = async (req, res) => {
  try {
    let supplierId = req.params.id?.trim();

    try {
      supplierId = normalizeObjectIdOrThrow(supplierId, "supplierId");
    } catch (error) {
      return res.status(error.status || 400).json({
        success: false,
        status: error.status || 400,
        message: error.message || "Invalid supplier ID",
      });
    }

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
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
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

    const supplier = await Supplier.findById(supplierId)
      .populate({
        path: "advancePayment.bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();

    if (!supplier) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Supplier not found",
      });
    }

    // Calculate totals from ALL records (not just paginated ones)
    const allExpenseData = await ExpanceIncome.find({
      supplierId: supplierId,
    })
      .populate("orderId", "purchasePrice")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
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
    let advancePaymentDetails = [];
    if (Array.isArray(supplier?.advancePayment)) {
      advancePaymentDetails = supplier.advancePayment.map((payment) => {
        const { bankId, bank } = buildBankResponse(payment.bankId);
        const amount = payment.amount || 0;
        totalBalance += amount;
        return {
          bankId,
          bank,
          amount,
        };
      });
    } else {
      totalBalance = supplier?.advancePayment || 0;
    }

    const formattedData = supplierExpanseData.map((item) => {
      const { bankId, bank } = buildBankResponse(item.bankId);
      return {
        _id: item._id,
        orderId: item.orderId,
        paidAmount: item.paidAmount,
        purchasePrice: item.orderId?.purchasePrice || 0,
        dueAmount:
          item.dueAmount !== undefined && item.dueAmount !== null
            ? item.dueAmount
            : item.orderId?.purchasePrice || 0,
        status: item.status,
        bankId,
        bank,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Supplier expenses fetched successfully",
      data: {
        supplierName: `${supplier?.firstName || ""} ${supplier?.lastName || ""}`.trim() || "Unknown Supplier",
        supplierId: supplier?._id,
        orders: formattedData,
        totalCount: totalCount,
        page: pageNum,
        limit: limitNum,
        totals: {
          totalBalance,
          purchaseTotal,
          dueTotal,
        },
        advancePayments: advancePaymentDetails,
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

    let normalizedExpenseId;
    let normalizedSupplierId;
    let normalizedBankId;
    try {
      normalizedExpenseId = normalizeObjectIdOrThrow(expenseId, "expenseId");
      normalizedSupplierId = normalizeObjectIdOrThrow(supplierId, "supplierId");
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (error) {
      return res.status(error.status || 400).json({
        success: false,
        status: error.status || 400,
        message: error.message || "Invalid identifiers provided",
      });
    }

    // Find the expense record
    const expense = await ExpanceIncome.findById(normalizedExpenseId);
    if (!expense) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Expense record not found",
      });
    }

    // Check if payment is already paid
    if (expense.status === PAYMENT_STATUS.PAID ) {
      return res.status(201).json({
        success: false,
        status: 201,
        message: "Payment is already checked/paid",
      });
    }

    // Find the supplier
    const supplier = await Supplier.findById(normalizedSupplierId);
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
    const bankPaymentIndex = supplier.advancePayment.findIndex((payment) => {
      if (!payment.bankId) {
        return false;
      }
      const storedBankId =
        typeof payment.bankId === "object"
          ? payment.bankId.toString()
          : payment.bankId;
      return storedBankId === normalizedBankId.toString();
    });

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
        status: 409,
        message: `Insufficient balance. Required: ${formatCurrency(dueAmount)}, Available: ${formatCurrency(bankPayment.amount)}`,
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
    expense.bankId = normalizedBankId; // Store bank ID in expense
    await expense.save();

    const populatedExpense = await ExpanceIncome.findById(expense._id)
      .populate("orderId", "product clientName orderId purchasePrice")
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();

    const { bankId: expenseBankId, bank } = buildBankResponse(populatedExpense?.bankId);

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Payment marked as paid successfully",
      data: {
        expense: {
          ...populatedExpense,
          bankId: expenseBankId,
          bank,
        },
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

// export supplier order details controller
export default { getSupplierOrderDetails, markPaymentDone };
