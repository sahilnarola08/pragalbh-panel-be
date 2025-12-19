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

    // Calculate purchase price from expense: dueAmount + paidAmount
    const expenseDueAmount = typeof expenseItem.dueAmount === "number" 
      ? expenseItem.dueAmount 
      : parseFloat(expenseItem.dueAmount) || 0;
    const expensePaidAmount = typeof expenseItem.paidAmount === "number" 
      ? expenseItem.paidAmount 
      : parseFloat(expenseItem.paidAmount) || 0;
    const calculatedPurchasePrice = expenseDueAmount + expensePaidAmount;

    // Priority 1: Match by name AND purchasePrice together (most accurate for duplicates)
    // This handles cases where same product name has different prices
    if (normalizedDescription && calculatedPurchasePrice > 0) {
      const matchedByNameAndPrice = products.find((product) => {
        const productNameMatch = product.productName && 
          product.productName.toLowerCase().trim() === normalizedDescription;
        if (!productNameMatch) return false;
        
        const productPrice = Number(product.purchasePrice || 0);
        // Match by calculated purchase price (dueAmount + paidAmount)
        return Math.abs(productPrice - calculatedPurchasePrice) < 0.01; // Allow small floating point difference
      });
      if (matchedByNameAndPrice) {
        return matchedByNameAndPrice;
      }
    }

    // Priority 2: Match by purchasePrice only (reliable when price is unique)
    if (calculatedPurchasePrice > 0) {
      const matchedByPrice = products.find(
        (product) => Math.abs(Number(product.purchasePrice || 0) - calculatedPurchasePrice) < 0.01
      );
      if (matchedByPrice) {
        return matchedByPrice;
      }
    }

    // Priority 3: Match by dueAmount only (if purchasePrice calculation failed)
    if (expenseDueAmount > 0) {
      const matchedByDueAmount = products.find(
        (product) => Math.abs(Number(product.purchasePrice || 0) - expenseDueAmount) < 0.01
      );
      if (matchedByDueAmount) {
        return matchedByDueAmount;
      }
    }

    // Priority 4: Match by name only (less reliable for duplicates, but better than nothing)
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

    // Priority 5: Fallback to first product
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

    // Get total count efficiently - we'll calculate it from allExpenseData later
    // This avoids an extra query since we need allExpenseData anyway for totals

    // find all expense/income records for given supplier with pagination
    // Filter out records where orderId is null or order is deleted
    const supplierExpanseData = await ExpanceIncome.find({
      supplierId: supplierId,
    })
      .populate("supplierId", "firstName lastName email phone advancePayment")
      .populate({
        path: "orderId",
        select:
          "orderId products.productName products.orderDate products.dispatchDate products.purchasePrice products.sellingPrice isDeleted",
        match: { isDeleted: { $ne: true } }, // Exclude deleted orders
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
    
    // Filter out records where orderId is null (deleted orders)
    const filteredExpanseData = supplierExpanseData.filter(item => item.orderId !== null && item.orderId !== undefined);

    if (!filteredExpanseData || filteredExpanseData.length === 0) {
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
    // Filter out records where orderId is null or order is deleted
    const allExpenseDataRaw = await ExpanceIncome.find({
      supplierId: supplierId,
    })
      .populate({
        path: "orderId",
        select:
          "orderId products.productName products.orderDate products.dispatchDate products.purchasePrice products.sellingPrice isDeleted",
        match: { isDeleted: { $ne: true } }, // Exclude deleted orders
      })
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();
    
    // Filter out records where orderId is null (deleted orders)
    const allExpenseData = allExpenseDataRaw.filter(item => item.orderId !== null && item.orderId !== undefined);
    
    // Calculate total count from filtered data
    const totalCount = allExpenseData.length;

    const purchaseTotal = allExpenseData.reduce((sum, item) => {
      // Use expense's calculated purchase price: dueAmount + paidAmount
      const expenseDueAmount = parseFloat(item.dueAmount) || 0;
      const expensePaidAmount = parseFloat(item.paidAmount) || 0;
      const calculatedPurchasePrice = expenseDueAmount + expensePaidAmount;
      
      if (calculatedPurchasePrice > 0) {
        // Use calculated purchase price from expense (most accurate)
        return sum + calculatedPurchasePrice;
      } else {
        // Fallback to order's purchase price if expense values are not set
        const { purchasePrice: orderPurchasePrice } = buildOrderDetails(
          item.orderId,
          item
        );
        return sum + orderPurchasePrice;
      }
    }, 0);

    const dueTotal = allExpenseData.reduce((sum, item) => {
      // Use expense's stored dueAmount directly (most accurate)
      const expenseDueAmount = parseFloat(item.dueAmount) || 0;
      if (expenseDueAmount > 0 || item.dueAmount !== undefined) {
        return sum + expenseDueAmount;
      } else {
        // Fallback: calculate from purchasePrice - paidAmount
        const expensePaidAmount = parseFloat(item.paidAmount) || 0;
        const { purchasePrice: orderPurchasePrice } = buildOrderDetails(
          item.orderId,
          item
        );
        return sum + Math.max(0, orderPurchasePrice - expensePaidAmount);
      }
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

    const formattedData = filteredExpanseData.map((item) => {
      const { bankId, bank } = buildBankResponse(item.bankId);
      
      // Use expense's stored values for accurate product matching
      const expenseDueAmount = parseFloat(item.dueAmount) || 0;
      const expensePaidAmount = parseFloat(item.paidAmount) || 0;
      const calculatedPurchasePrice = expenseDueAmount + expensePaidAmount;
      
      // Build order details with expense item (includes dueAmount and paidAmount for matching)
      const {
        order: orderDetails,
        purchasePrice: orderPurchasePrice,
      } = buildOrderDetails(item.orderId, {
        ...item,
        dueAmount: expenseDueAmount,
        paidAmount: expensePaidAmount,
      });
      
      // Use expense's dueAmount if set, otherwise calculate from purchasePrice - paidAmount
      let dueAmount;
      if (expenseDueAmount > 0 || item.dueAmount !== undefined) {
        // Use the stored dueAmount from expense record
        dueAmount = expenseDueAmount;
      } else {
        // Fallback: calculate from purchasePrice - paidAmount
        dueAmount = Math.max(0, orderPurchasePrice - expensePaidAmount);
      }
      
      // Use calculated purchase price if available, otherwise use order's purchasePrice
      const purchasePrice = calculatedPurchasePrice > 0 ? calculatedPurchasePrice : orderPurchasePrice;

      // Get order date from order details or use expense date
      let orderDate = item.date || item.createdAt;
      if (orderDetails && orderDetails.products && orderDetails.products.length > 0) {
        const firstProduct = orderDetails.products[0];
        if (firstProduct.orderDate) {
          orderDate = firstProduct.orderDate;
        }
      }

      return {
        _id: item._id,
        orderId: orderDetails,
        orderDate: orderDate,
        paidAmount: expensePaidAmount,
        purchasePrice: purchasePrice,
        dueAmount: dueAmount,
        status: item.status,
        bankId,
        bank,
        paymentDate: item.date || null,
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

    // Find the expense record with order populated
    const expense = await ExpanceIncome.findById(normalizedExpenseId)
      .populate({
        path: "orderId",
        select: "orderId products.productName products.purchasePrice",
      });
    if (!expense) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Expense record not found",
      });
    }

    // Get purchasePrice from order if not provided in request
    if (purchasePriceNum === null && expense.orderId) {
      const { purchasePrice: orderPurchasePrice } = buildOrderDetails(expense.orderId, expense);
      if (orderPurchasePrice > 0) {
        purchasePriceNum = orderPurchasePrice;
      }
    }

    // Check if payment is fully paid (dueAmount is 0)
    // Allow updates if there's still a due amount, even if status is PAID
    const currentDueCheck = parseFloat(expense.dueAmount) || 0;
    if (currentDueCheck === 0 && expense.status === PAYMENT_STATUS.PAID) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Payment is already fully paid. No due amount remaining.",
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

    // Calculate the difference: new paid amount - current paid amount
    // This is the amount to deduct from advance payment
    const currentPaidAmountForDeduction = parseFloat(expense.paidAmount) || 0;
    let amountToDeductFromAdvance;
    
    if (purchasePriceNum !== null) {
      // If purchasePrice is provided, paidAmount is the new total, so deduct the difference
      amountToDeductFromAdvance = paidAmountNum - currentPaidAmountForDeduction;
    } else {
      // If purchasePrice not provided, treat as incremental
      amountToDeductFromAdvance = paidAmountNum;
    }
    
    // Deduct the difference from total advancePayment
    let remainingToDeduct = Math.max(0, amountToDeductFromAdvance);

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
    
    // Calculate new dueAmount based on purchasePrice and paidAmount
    let newDueAmount;
    let newPaidAmount;
    
    if (purchasePriceNum !== null) {
      // If purchasePrice is provided, use paidAmount as the new total paid amount
      // paidAmount from request is the NEW total paid amount (not incremental)
      newPaidAmount = paidAmountNum;
      
      // Calculate dueAmount: purchasePrice - paidAmount
      newDueAmount = Math.max(0, purchasePriceNum - newPaidAmount);
      
      // Validate: paidAmount should not exceed purchasePrice
      if (newPaidAmount > purchasePriceNum) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: `paidAmount (${newPaidAmount}) cannot exceed purchasePrice (${purchasePriceNum})`,
        });
      }
    } else {
      // If purchasePrice not provided, treat paidAmount as incremental
      newPaidAmount = currentPaidAmount + paidAmountNum;
      newDueAmount = Math.max(0, currentDueAmount - paidAmountNum);
    }

    expense.paidAmount = newPaidAmount;
    expense.dueAmount = newDueAmount;
    
    // Update status to PAID when a payment is made
    // Case 1: purchasePrice = 300, paidAmount = 300 → dueAmount = 0, status = PAID
    // Case 2: purchasePrice = 300, paidAmount = 150 → dueAmount = 150, status = PAID
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
    const { clearCacheByRoute } = await import("../middlewares/cache.js");
    
    invalidateCache('income');
    invalidateCache('supplier', normalizedSupplierId);
    invalidateCache('supplier');
    invalidateCache('dashboard');
    
    // Clear supplier-orderdetails cache to ensure fresh data
    clearCacheByRoute(`/supplier-orderdetails/${normalizedSupplierId}`);
    clearCacheByRoute('/supplier-orderdetails');

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
          deducted: amountToDeductFromAdvance,
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
