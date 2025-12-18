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

// build order response with a single relevant product for the expense
const buildOrderDetails = (orderDoc, expenseItem = {}) => {
  if (!orderDoc || typeof orderDoc !== "object") {
    return { order: null, purchasePrice: 0 };
  }

  const products = Array.isArray(orderDoc.products) ? orderDoc.products : [];
  const normalizedDescription = expenseItem.description
    ? expenseItem.description.toLowerCase().trim()
    : null;

  const findProductMatch = () => {
    if (!products.length) {
      return null;
    }

    if (normalizedDescription) {
      const nameMatchedProduct = products.find(
        (product) =>
          product.productName &&
          product.productName.toLowerCase().trim() === normalizedDescription
      );
      if (nameMatchedProduct) {
        return nameMatchedProduct;
      }
    }

    const amountPriorities = [];
    if (typeof expenseItem.dueAmount === "number" && expenseItem.dueAmount > 0) {
      amountPriorities.push(expenseItem.dueAmount);
    }
    if (typeof expenseItem.paidAmount === "number" && expenseItem.paidAmount > 0) {
      amountPriorities.push(expenseItem.paidAmount);
    }

    for (const amount of amountPriorities) {
      const matchedByAmount = products.find(
        (product) => Number(product.purchasePrice || 0) === Number(amount)
      );
      if (matchedByAmount) {
        return matchedByAmount;
      }
    }

    return products[0];
  };

  const matchedProduct = findProductMatch();
  const productPayload = matchedProduct
    ? [
        {
          productName: matchedProduct.productName || "",
          orderDate: matchedProduct.orderDate,
          dispatchDate: matchedProduct.dispatchDate,
          purchasePrice: matchedProduct.purchasePrice || 0,
          sellingPrice: matchedProduct.sellingPrice || 0,
        },
      ]
    : [];

  return {
    order: {
      _id: orderDoc._id,
      orderId: orderDoc.orderId,
      products: productPayload,
    },
    purchasePrice: matchedProduct?.purchasePrice || 0,
  };
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

    // Parse page and limit to integers with proper defaults and validation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
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
      .populate({
        path: "orderId",
        select:
          "orderId products.productName products.orderDate products.dispatchDate products.purchasePrice products.sellingPrice",
      })
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
      .populate({
        path: "orderId",
        select:
          "orderId products.productName products.orderDate products.dispatchDate products.purchasePrice products.sellingPrice",
      })
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();

    const purchaseTotal = allExpenseData.reduce((sum, item) => {
      const { purchasePrice: orderPurchasePrice } = buildOrderDetails(
        item.orderId,
        item
      );
      return sum + orderPurchasePrice;
    }, 0);

    const dueTotal = allExpenseData.reduce((sum, item) => {
      const { purchasePrice: orderPurchasePrice } = buildOrderDetails(
        item.orderId,
        item
      );
      // If dueAmount is set, use it; otherwise fall back to selected product purchase price for old records
      const due =
        item.dueAmount !== undefined && item.dueAmount !== null
          ? item.dueAmount
          : orderPurchasePrice;
      return sum + due;
    }, 0);

    const paidTotal = allExpenseData.reduce((sum, item) => {
      const paidAmount = parseFloat(item.paidAmount) || 0;
      return sum + paidAmount;
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
      const {
        order: orderDetails,
        purchasePrice: orderPurchasePrice,
      } = buildOrderDetails(item.orderId, item);
      const dueAmount =
        item.dueAmount !== undefined && item.dueAmount !== null
          ? item.dueAmount
          : orderPurchasePrice;

      return {
        _id: item._id,
        orderId: orderDetails,
        paidAmount: item.paidAmount,
        purchasePrice: orderPurchasePrice,
        dueAmount,
        status: item.status,
        bankId,
        bank,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
          paidTotal,
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

// Mark Payment as Paid
export const markPaymentDone = async (req, res) => {
  try {
    const { expenseId, supplierId, paidAmount, paymentDate, purchasePrice, bankId } = req.body;

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Validate required fields
    if (!expenseId || !supplierId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "expenseId and supplierId are required",
      });
    }

    // Validate paidAmount is provided and not zero
    if (paidAmount === undefined || paidAmount === null) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "paidAmount is required",
      });
    }

    const paidAmountNum = parseFloat(paidAmount);
    if (isNaN(paidAmountNum) || paidAmountNum < 0) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "paidAmount must be a valid positive number",
      });
    }

    // If paidAmount is 0, don't update status
    if (paidAmountNum === 0) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "paidAmount cannot be 0. Status will not be updated.",
      });
    }

    let normalizedExpenseId;
    let normalizedSupplierId;
    let normalizedBankId = null;

    try {
      normalizedExpenseId = normalizeObjectIdOrThrow(expenseId, "expenseId");
      normalizedSupplierId = normalizeObjectIdOrThrow(supplierId, "supplierId");
      
      // bankId is optional - only normalize if provided
      if (bankId) {
        normalizedBankId = await normalizeBankIdOrThrow(bankId);
      }
    } catch (error) {
      return res.status(error.status || 400).json({
        success: false,
        status: error.status || 400,
        message: error.message || "Invalid identifiers provided",
      });
    }

    // Validate purchasePrice if provided
    let purchasePriceNum = null;
    if (purchasePrice !== undefined && purchasePrice !== null) {
      purchasePriceNum = parseFloat(purchasePrice);
      if (isNaN(purchasePriceNum) || purchasePriceNum < 0) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "purchasePrice must be a valid positive number",
        });
      }
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
    if (expense.status === PAYMENT_STATUS.PAID) {
      return res.status(400).json({
        success: false,
        status: 400,
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
      supplier.advancePayment = [];
    }

    // Calculate total advancePayment across all banks
    const totalAdvancePayment = supplier.advancePayment.reduce((sum, payment) => {
      return sum + (parseFloat(payment.amount) || 0);
    }, 0);

    // Deduct paidAmount from total advancePayment (not purchasePrice)
    let remainingToDeduct = paidAmountNum;

    // Deduct from banks sequentially (first to last)
    for (let i = 0; i < supplier.advancePayment.length && remainingToDeduct > 0; i++) {
      const currentAmount = parseFloat(supplier.advancePayment[i].amount) || 0;
      
      if (currentAmount > 0) {
        if (currentAmount >= remainingToDeduct) {
          // This bank has enough, deduct and stop
          supplier.advancePayment[i].amount = currentAmount - remainingToDeduct;
          remainingToDeduct = 0;
        } else {
          // This bank doesn't have enough, deduct all and continue
          remainingToDeduct -= currentAmount;
          supplier.advancePayment[i].amount = 0;
        }
      }
    }

    // Remove bank entries with 0 amount
    supplier.advancePayment = supplier.advancePayment.filter(payment => {
      const amount = parseFloat(payment.amount) || 0;
      return amount > 0;
    });

    // Calculate new total advancePayment
    const newTotalAdvancePayment = supplier.advancePayment.reduce((sum, payment) => {
      return sum + (parseFloat(payment.amount) || 0);
    }, 0);

    await supplier.save();

    // Update expense record
    const currentPaidAmount = parseFloat(expense.paidAmount) || 0;
    const currentDueAmount = parseFloat(expense.dueAmount) || 0;
    
    // Calculate new dueAmount
    let newDueAmount;
    if (purchasePriceNum !== null) {
      // If purchasePrice is provided, calculate: purchasePrice - (currentPaidAmount + paidAmount)
      const totalPaid = currentPaidAmount + paidAmountNum;
      newDueAmount = Math.max(0, purchasePriceNum - totalPaid);
    } else {
      // If purchasePrice not provided, deduct from current dueAmount
      newDueAmount = Math.max(0, currentDueAmount - paidAmountNum);
    }

    expense.paidAmount = currentPaidAmount + paidAmountNum;
    expense.dueAmount = newDueAmount;
    
    // Mark as PAID if paidAmount is provided and > 0 (even if not fully paid)
    if (paidAmountNum > 0) {
      expense.status = PAYMENT_STATUS.PAID;
    }
    
    // Set bankId if provided
    if (normalizedBankId) {
      expense.bankId = normalizedBankId;
    }
    
    // Set paymentDate if provided
    if (paymentDate) {
      const date = new Date(paymentDate);
      if (!isNaN(date.getTime())) {
        expense.date = date;
      }
    }
    
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

    // Invalidate cache after payment update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('income');
    invalidateCache('supplier', normalizedSupplierId);
    invalidateCache('supplier');
    invalidateCache('dashboard');

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
        advancePayment: {
          previousTotal: totalAdvancePayment,
          deducted: paidAmountNum,
          newTotal: newTotalAdvancePayment,
          remainingToDeduct: remainingToDeduct > 0 ? remainingToDeduct : 0,
        },
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
