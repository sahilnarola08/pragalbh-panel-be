import Income from "../models/income.js";
import ExpanceIncome from "../models/expance_inc.js";
import Master from "../models/master.js";
import mongoose from "mongoose";

const normalizeBankIdOrThrow = async (bankId) => {
  if (bankId === undefined || bankId === null || bankId === "") {
    return null;
  }

  const rawId =
    typeof bankId === "object" && bankId !== null
      ? bankId._id || bankId.id || bankId.toString()
      : bankId;

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error("Invalid bank ID format");
    error.status = 400;
    throw error;
  }

  const bank = await Master.findOne({
    _id: rawId,
    isDeleted: false,
  }).select("_id name");

  if (!bank) {
    const error = new Error("Bank not found or is inactive");
    error.status = 404;
    throw error;
  }

  return bank._id;
};

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

const docToPlainWithBank = (doc) => {
  if (!doc) return doc;
  const plain = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
  const { bankId, bank } = buildBankResponse(plain?.bankId);
  return {
    ...plain,
    bankId,
    bank,
  };
};

// format mediator amount details with populated mediator info
const formatMediatorAmountDetails = (mediatorAmountArray, mediatorDetails = []) => {
  if (!mediatorAmountArray || !Array.isArray(mediatorAmountArray)) {
    return [];
  }

  return mediatorAmountArray.map((item) => {
    const mediatorId = item.mediatorId?._id || item.mediatorId;
    const matchedMediator = mediatorDetails.find(
      (m) => m._id && m._id.toString() === String(mediatorId)
    );

    const result = {
      mediatorId: mediatorId,
      mediator: matchedMediator
        ? { _id: matchedMediator._id, name: matchedMediator.name }
        : null,
    };

    // Only include amount if it exists and is not null/undefined
    if (item.amount !== undefined && item.amount !== null) {
      result.amount = Math.round(item.amount * 100) / 100;
    }

    return result;
  });
};

// format order mediator info (only mediator, mediatorAmount is now in Income model)
const formatOrderMediatorInfo = (order) => {
  if (!order) return null;

  const formattedOrder = { ...order };

  // Format mediator
  if (formattedOrder.mediator) {
    if (typeof formattedOrder.mediator === 'object' && formattedOrder.mediator._id) {
      formattedOrder.mediator = {
        _id: formattedOrder.mediator._id,
        name: formattedOrder.mediator.name || null,
      };
    } else {
      formattedOrder.mediator = null;
    }
  }

  return formattedOrder;
};

// get income and expence 
export const getIncomeExpance = async (req, res) => {
  try {
    let {
      incExpType = 3,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
      orderId = "",
      startDate = "",
      endDate = ""
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;
    const sortQuery = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    // Base query
    const searchQuery = {};
    let orderFilter = {};

    // 🔍 Filter by Order ID (custom orderId)
    if (orderId) {
      const Order = (await import("../models/order.js")).default;
      const order = await Order.findOne({ orderId });
      if (order) {
        orderFilter = { orderId: order._id };
      } else {
        return res.status(200).json({
          status: 200,
          message: "No records found for the given orderId",
          data: { total: 0, page, limit, items: [] },
        });
      }
    }

    // Date range filter helper
    const buildDateFilter = () => {
      const dateFilter = {};
      
      if (!startDate && !endDate) {
        return null;
      }

      // Parse dates - support DD/MM/YYYY format
      const parseDate = (dateString) => {
        if (!dateString || typeof dateString !== 'string') return null;
        
        const trimmed = dateString.trim();
        
        // Try DD/MM/YYYY format first
        const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
          const day = parseInt(ddmmyyyy[1], 10);
          const month = parseInt(ddmmyyyy[2], 10) - 1; // Month is 0-indexed
          const year = parseInt(ddmmyyyy[3], 10);
          const date = new Date(year, month, day);
          date.setHours(0, 0, 0, 0); // Start of day
          return date;
        }
        
        // Try YYYY-MM-DD format (ISO)
        const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) {
          const year = parseInt(iso[1], 10);
          const month = parseInt(iso[2], 10) - 1;
          const day = parseInt(iso[3], 10);
          const date = new Date(year, month, day);
          date.setHours(0, 0, 0, 0);
          return date;
        }
        
        // Try parsing as ISO string or default Date constructor
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
        
        return null;
      };

      if (startDate) {
        const start = parseDate(startDate);
        if (!start) {
          throw new Error("Invalid startDate format. Use DD/MM/YYYY or YYYY-MM-DD format.");
        }
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = parseDate(endDate);
        if (!end) {
          throw new Error("Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.");
        }
        end.setHours(23, 59, 59, 999); // End of day
        dateFilter.$lte = end;
      }

      return dateFilter;
    };

    let dateFilter = null;
    try {
      dateFilter = buildDateFilter();
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }

    let data = [];
    let total = 0;

    // ====================== CASE 1: INCOME ======================
    if (incExpType == 1) {
      const incomeQuery = { ...searchQuery, ...orderFilter };
      if (dateFilter) {
        incomeQuery.date = dateFilter;
      }
      
      const incomeData = await Income.find(incomeQuery)
        .populate({
          path: "orderId",
          select: "product clientName sellingPrice orderId initialPayment mediator",
          populate: [
            {
              path: "mediator",
              select: "_id name",
              match: { isDeleted: false },
            },
          ],
        })
        .populate("clientId", "firstName lastName")
        .populate({
          path: "bankId",
          select: "_id name",
          match: { isDeleted: false },
        })
        .populate({
          path: "mediator",
          select: "_id name",
          match: { isDeleted: false },
        })
        .populate({
          path: "mediatorAmount.mediatorId",
          select: "_id name",
          match: { isDeleted: false },
        })
        .sort(sortQuery)
        .lean();

      // 🔍 Apply full text filtering manually
      const filtered = incomeData.filter((item) => {
        if (!search) return true;

        const searchLower = search.toLowerCase().trim();

        // Client Name
        const clientName =
          item.orderId?.clientName?.toLowerCase() ||
          `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.toLowerCase().trim();

        // Product Name
        const productName = (item.orderId?.product || "").toLowerCase();

        // Description
        const description = (item.Description || "").toLowerCase();

        // Order ID
        const orderId = (item.orderId?.orderId || "").toLowerCase();

        // Bank Name
        const bankName = (item.bankId?.name || "").toLowerCase();

        // Status
        const status = (item.status || "").toLowerCase();

        // Date - multiple formats
        let dateStr = "";
        if (item.date) {
          const dateObj = new Date(item.date);
          dateStr = dateObj.toLocaleDateString("en-GB").toLowerCase() + " " +
            dateObj.toLocaleDateString("en-US").toLowerCase() + " " +
            dateObj.toISOString().split("T")[0].toLowerCase();
        }

        // Check if search matches any field
        return (
          clientName.includes(searchLower) ||
          productName.includes(searchLower) ||
          description.includes(searchLower) ||
          bankName.includes(searchLower) ||
          orderId.includes(searchLower) ||
          status.includes(searchLower) ||
          dateStr.includes(searchLower)
        );
      });

      const count = filtered.length;
      const sliced = filtered.slice(skip, skip + limit);

      data = sliced.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        const formattedOrder = formatOrderMediatorInfo(item.orderId);
        
        // Format mediator from Income model
        let formattedMediator = null;
        if (item.mediator) {
          if (typeof item.mediator === 'object' && item.mediator._id) {
            formattedMediator = {
              _id: item.mediator._id,
              name: item.mediator.name || null,
            };
          } else {
            formattedMediator = null;
          }
        }

        // Format mediatorAmount from Income model
        let formattedMediatorAmount = [];
        if (item.mediatorAmount && Array.isArray(item.mediatorAmount)) {
          const mediatorDetails = item.mediatorAmount
            .map((maItem) => maItem.mediatorId)
            .filter((m) => m && typeof m === "object");
          formattedMediatorAmount = formatMediatorAmountDetails(
            item.mediatorAmount,
            mediatorDetails
          );
        }

        return {
          _id: item._id,
          incExpType: 1,
          date: item.date,
          orderId: formattedOrder,
          description: item.Description || item.orderId?.product || "",
          product: item.orderId?.product || "",
          sellingPrice: Math.round((item.orderId?.sellingPrice || item.sellingPrice || 0) * 100) / 100,
          receivedAmount: Math.round((item.receivedAmount || 0) * 100) / 100,
          initialPayment: Math.round((item.orderId?.initialPayment || 0) * 100) / 100,
          clientName:
            item.orderId?.clientName ||
            `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
          status: item.status,
          bankId,
          bank,
          mediator: formattedMediator,
          mediatorAmount: formattedMediatorAmount,
          isBankReceived: Boolean(item.isBankReceived),
          isMediatorReceived: Boolean(item.isMediatorReceived),
        };
      });

      total = count;
    }

    // ====================== CASE 2: EXPENSE ======================
    else if (incExpType == 2) {
      const expenseQuery = { ...searchQuery, ...orderFilter };
      // For expense, check both date and createdAt fields
      if (dateFilter) {
        expenseQuery.$or = [
          { date: dateFilter },
          { createdAt: dateFilter }
        ];
      }
      
      const expanceData = await ExpanceIncome.find(expenseQuery)
        .populate("orderId", "product clientName purchasePrice orderId")
        .populate("supplierId", "firstName lastName company supplierId ")
        .populate({
          path: "bankId",
          select: "_id name",
          match: { isDeleted: false },
        })
        .sort(sortQuery)
        .lean();

      // 🔍 Apply full text filtering manually
      const filtered = expanceData.filter((item) => {
        if (!search) return true;

        const searchLower = search.toLowerCase().trim();

        // Supplier Name - prioritize full name (firstName + lastName), also check company
        let supplierFullName = "";
        let supplierCompany = "";
        if (item.supplierId) {
          const firstName = (item.supplierId.firstName || "").toLowerCase();
          const lastName = (item.supplierId.lastName || "").toLowerCase();
          supplierFullName = `${firstName} ${lastName}`.trim();
          supplierCompany = (item.supplierId.company || "").toLowerCase();
        }

        // Product Name
        const productName = (item.orderId?.product || "").toLowerCase();

        // Description
        const description = (item.description || "").toLowerCase();

        // Order ID
        const orderId = (item.orderId?.orderId || "").toLowerCase();

        // Bank Name
        const bankName = (item.bankId?.name || "").toLowerCase();

        // Status
        const status = (item.status || "").toLowerCase();

        // Date - multiple formats
        let dateStr = "";
        const dateToUse = item.date || item.createdAt;
        if (dateToUse) {
          const dateObj = new Date(dateToUse);
          dateStr = dateObj.toLocaleDateString("en-GB").toLowerCase() + " " +
            dateObj.toLocaleDateString("en-US").toLowerCase() + " " +
            dateObj.toISOString().split("T")[0].toLowerCase();
        }

        // Check if search matches any field (prioritize full name, but also check company)
        return (
          supplierFullName.includes(searchLower) ||
          supplierCompany.includes(searchLower) ||
          productName.includes(searchLower) ||
          description.includes(searchLower) ||
          bankName.includes(searchLower) ||
          orderId.includes(searchLower) ||
          status.includes(searchLower) ||
          dateStr.includes(searchLower)
        );
      });

      const count = filtered.length;
      const sliced = filtered.slice(skip, skip + limit);

      data = sliced.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        return {
          _id: item._id,
          incExpType: 2,
          date: item.date || item.createdAt,
          orderId: item.orderId,
          description: item.description || item.orderId?.product || "",
          dueAmount: Math.round(
            (item.dueAmount !== undefined && item.dueAmount !== null
              ? item.dueAmount
              : item.orderId?.purchasePrice || 0) * 100
          ) / 100,
          clientName: item.orderId?.clientName || "",
          paidAmount: Math.round((item.paidAmount || 0) * 100) / 100,
          supplierName:
            `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
            item.supplierId?.company ||
            "",
          status: item.status,
          bankId,
          bank,
        };
      });

      total = count;
    }

    // ====================== CASE 3: BOTH ======================
    else if (incExpType == 3) {
      const finalQuery = { ...searchQuery, ...orderFilter };
      
      // Build queries with date filter
      const incomeQuery = { ...finalQuery };
      if (dateFilter) {
        incomeQuery.date = dateFilter;
      }
      
      const expenseQuery = { ...finalQuery };
      if (dateFilter) {
        expenseQuery.$or = [
          { date: dateFilter },
          { createdAt: dateFilter }
        ];
      }

      const [incomeData, expanceData] = await Promise.all([
        Income.find(incomeQuery)
          .populate({
            path: "orderId",
            select: "product clientName sellingPrice orderId initialPayment mediator",
            populate: [
              {
                path: "mediator",
                select: "_id name",
                match: { isDeleted: false },
              },
            ],
          })
          .populate("clientId", "firstName lastName")
          .populate({
            path: "bankId",
            select: "_id name",
            match: { isDeleted: false },
          })
          .populate({
            path: "mediator",
            select: "_id name",
            match: { isDeleted: false },
          })
          .populate({
            path: "mediatorAmount.mediatorId",
            select: "_id name",
            match: { isDeleted: false },
          })
          .sort(sortQuery)
          .lean(),
        ExpanceIncome.find(expenseQuery)
          .populate("orderId", "product clientName purchasePrice orderId")
          .populate("supplierId", "firstName lastName company supplierId")
          .populate({
            path: "bankId",
            select: "_id name",
            match: { isDeleted: false },
          })
          .sort(sortQuery)
          .lean(),
      ]);

      const incomeList = incomeData.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        const formattedOrder = formatOrderMediatorInfo(item.orderId);
        
        // Format mediator from Income model
        let formattedMediator = null;
        if (item.mediator) {
          if (typeof item.mediator === 'object' && item.mediator._id) {
            formattedMediator = {
              _id: item.mediator._id,
              name: item.mediator.name || null,
            };
          } else {
            formattedMediator = null;
          }
        }

        // Format mediatorAmount from Income model
        let formattedMediatorAmount = [];
        if (item.mediatorAmount && Array.isArray(item.mediatorAmount)) {
          const mediatorDetails = item.mediatorAmount
            .map((maItem) => maItem.mediatorId)
            .filter((m) => m && typeof m === "object");
          formattedMediatorAmount = formatMediatorAmountDetails(
            item.mediatorAmount,
            mediatorDetails
          );
        }

        return {
          _id: item._id,
          incExpType: 1,
          date: item.date,
          orderId: formattedOrder,
          description: item.Description || item.orderId?.product || "",
          product: item.orderId?.product || "",
          sellingPrice: Math.round((item.orderId?.sellingPrice || item.sellingPrice || 0) * 100) / 100,
          receivedAmount: Math.round((item.receivedAmount || 0) * 100) / 100,
          initialPayment: Math.round((item.orderId?.initialPayment || 0) * 100) / 100,
          clientName:
            item.orderId?.clientName ||
            `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
          status: item.status,
          bankId,
          bank,
          mediator: formattedMediator,
          mediatorAmount: formattedMediatorAmount,
          isBankReceived: Boolean(item.isBankReceived),
          isMediatorReceived: Boolean(item.isMediatorReceived),
        };
      });

      const expanceList = expanceData.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        return {
          _id: item._id,
          incExpType: 2,
          date: item.date || item.createdAt,
          orderId: item.orderId,
          description: item.description || item.orderId?.product || "",
          dueAmount: Math.round(
            (item.dueAmount !== undefined && item.dueAmount !== null
              ? item.dueAmount
              : item.orderId?.purchasePrice || 0) * 100
          ) / 100,
          clientName: item.orderId?.clientName || "",
          paidAmount: Math.round((item.paidAmount || 0) * 100) / 100,
          supplierName:
            `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
            item.supplierId?.company ||
            "",
          supplierId: item.supplierId,
          status: item.status,
          bankId,
          bank,
        };
      });
      // 🔍 Combined filtering
      const merged = [...incomeList, ...expanceList].filter((item) => {
        if (!search) return true;

        const searchLower = search.toLowerCase().trim();

        // Name (Client or Supplier)
        const name =
          item.clientName?.toLowerCase() ||
          item.supplierName?.toLowerCase() || "";

        // Product Name
        const productName = (item.product || item.orderId?.product || "").toLowerCase();

        // Description
        const description = (item.description || "").toLowerCase();

        // Order ID
        const orderId = (item.orderId?.orderId || "").toLowerCase();

        // Bank Name
        const bankName = (item.bank?.name || "").toLowerCase();

        // Status
        const status = (item.status || "").toLowerCase();

        // Date - multiple formats
        let dateStr = "";
        if (item.date) {
          const dateObj = new Date(item.date);
          dateStr = dateObj.toLocaleDateString("en-GB").toLowerCase() + " " +
            dateObj.toLocaleDateString("en-US").toLowerCase() + " " +
            dateObj.toISOString().split("T")[0].toLowerCase();
        }

        // Check if search matches any field
        return (
          name.includes(searchLower) ||
          productName.includes(searchLower) ||
          description.includes(searchLower) ||
          bankName.includes(searchLower) ||
          orderId.includes(searchLower) ||
          status.includes(searchLower) ||
          dateStr.includes(searchLower)
        );
      });

      // Sorting + pagination
      const sorted = merged.sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        return sortOrder === "asc" ? da - db : db - da;
      });

      total = merged.length;
      data = sorted.slice(skip, skip + limit);
    }

    // ✅ Final Response
    res.status(200).json({
      status: 200,
      message: "Income and Expense fetched successfully",
      data: {
        total,
        page,
        limit,
        items: data,
      },
    });
    
  } catch (error) {
    console.error("Error fetching income and expance:", error);
    res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
// Helper function to normalize and validate mediator
const normalizeMediatorIdOrThrow = async (mediatorId) => {
  if (!mediatorId) {
    return null;
  }

  const rawId =
    typeof mediatorId === "object" && mediatorId !== null
      ? mediatorId._id || mediatorId.id || mediatorId.toString()
      : mediatorId;

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error("Invalid mediator ID format");
    error.status = 400;
    throw error;
  }

  const mediator = await Master.findOne({
    _id: rawId,
    isDeleted: false,
  }).select("_id name");

  if (!mediator) {
    const error = new Error("Mediator not found or is inactive");
    error.status = 404;
    throw error;
  }

  return mediator._id;
};

// Helper function to normalize mediator amount array for Income model
const normalizeIncomeMediatorAmount = async (mediatorAmountArray) => {
  if (!mediatorAmountArray || !Array.isArray(mediatorAmountArray)) {
    return [];
  }

  const normalized = [];
  const seenIds = new Set();

  for (const item of mediatorAmountArray) {
    const mediatorId = item?.mediatorId || item;
    
    if (!mediatorId) continue;

    const idString = String(mediatorId);
    if (seenIds.has(idString)) continue;

    try {
      const validatedMediatorId = await normalizeMediatorIdOrThrow(mediatorId);
      const amount = item?.amount !== undefined && item?.amount !== null
        ? Math.round((item.amount || 0) * 100) / 100
        : 0;

      if (amount > 0) {
        normalized.push({
          mediatorId: validatedMediatorId,
          amount: amount,
        });
        seenIds.add(idString);
      }
    } catch (error) {
      throw error;
    }
  }

  return normalized;
};

// Add New Income Entry
export const addIncomeEntry = async (req, res) => {
  try {
    const {
      orderId,
      date,
      description,
      receivedAmount,
      status,
      bankId,
      mediatorId,
      mediatorAmount,
      isBankReceived = false,
      isMediatorReceived = false,
    } = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: "orderId is required",
      });
    }

    // Find order by orderId field
    const Order = (await import("../models/order.js")).default;
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({
        status: 404,
        message: "Order not found",
      });
    }

    // Find client from order
    const User = (await import("../models/user.js")).default;
    const client = await User.findOne({
      $or: [
        { firstName: new RegExp(order.clientName, "i") },
        { lastName: new RegExp(order.clientName, "i") },
        { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: order.clientName, options: "i" } } }
      ]
    });

    if (!client) {
      return res.status(404).json({
        status: 404,
        message: "Client not found for this order",
      });
    }

    let normalizedBankId = null;
    try {
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (error) {
      return res.status(error.status || 400).json({
        status: error.status || 400,
        message: error.message || "Invalid bank ID",
      });
    }

    // Handle mediator: use provided mediatorId or default to order's mediator
    let normalizedMediatorId = null;
    const finalMediatorId = mediatorId || order.mediator;
    
    if (finalMediatorId) {
      try {
        normalizedMediatorId = await normalizeMediatorIdOrThrow(finalMediatorId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid mediator ID",
        });
      }
    }

    // Handle mediatorAmount: normalize array if provided
    let normalizedMediatorAmountArray = [];
    let shouldSetMediatorReceived = false;
    
    if (mediatorAmount !== undefined && mediatorAmount !== null) {
      if (Array.isArray(mediatorAmount)) {
        try {
          normalizedMediatorAmountArray = await normalizeIncomeMediatorAmount(mediatorAmount);
          // If mediatorAmount is provided and normalized array has items, set isMediatorReceived to true
          shouldSetMediatorReceived = normalizedMediatorAmountArray.length > 0;
        } catch (error) {
          return res.status(error.status || 400).json({
            status: error.status || 400,
            message: error.message || "Invalid mediator amount data",
          });
        }
      } else if (typeof mediatorAmount === 'number' && normalizedMediatorId) {
        // If single number provided and mediatorId exists, create array entry
        const roundedAmount = Math.round(mediatorAmount * 100) / 100;
        if (roundedAmount > 0) {
          normalizedMediatorAmountArray = [{
            mediatorId: normalizedMediatorId,
            amount: roundedAmount,
          }];
          // If mediatorAmount is provided as number > 0, set isMediatorReceived to true
          shouldSetMediatorReceived = true;
        }
      }
    }

    // Create new income entry - automatically use order's data
    // Multiple income entries allowed per order (for installment payments)
    const newIncome = await Income.create({
      date: date || new Date(),
      orderId: order._id,
      Description: description || order.product,
      sellingPrice: Math.round((order.sellingPrice || 0) * 100) / 100,
      receivedAmount: Math.round((receivedAmount || 0) * 100) / 100,
      clientId: client._id,
      status: status || "pending",
      bankId: normalizedBankId,
      mediator: normalizedMediatorId,
      mediatorAmount: normalizedMediatorAmountArray,
      isBankReceived: Boolean(isBankReceived),
      // If mediatorAmount is provided and has valid entries, set isMediatorReceived to true
      // Otherwise, use the provided isMediatorReceived value
      isMediatorReceived: (mediatorAmount !== undefined && mediatorAmount !== null)
        ? shouldSetMediatorReceived
        : Boolean(isMediatorReceived),
    });

    const populatedIncome = await Income.findById(newIncome._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediator",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediatorAmount.mediatorId",
        select: "_id name",
        match: { isDeleted: false },
      });

    // Format mediatorAmount details
    const incomeResponse = docToPlainWithBank(populatedIncome);
    if (incomeResponse.mediatorAmount && Array.isArray(incomeResponse.mediatorAmount)) {
      const mediatorDetails = populatedIncome.mediatorAmount
        .map((item) => item.mediatorId)
        .filter((m) => m && typeof m === "object");
      incomeResponse.mediatorAmount = formatMediatorAmountDetails(
        incomeResponse.mediatorAmount,
        mediatorDetails
      );
    }

    // Format mediator
    if (incomeResponse.mediator) {
      if (typeof incomeResponse.mediator === 'object' && incomeResponse.mediator._id) {
        incomeResponse.mediator = {
          _id: incomeResponse.mediator._id,
          name: incomeResponse.mediator.name || null,
        };
      } else {
        incomeResponse.mediator = null;
      }
    }

    return res.status(201).json({
      status: 201,
      message: "Income entry added successfully",
      data: incomeResponse,
    });
  } catch (error) {
    console.error("Error adding income entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Add Expense Entry (linked to order & supplier)
export const addExpanseEntry = async (req, res) => {
  try {
    const { orderId, date, description, paidAmount, status, bankId } = req.body;

    // ✅ Validate required fields
    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: "orderId is required",
      });
    }

    // ✅ Find order by orderId field
    const Order = (await import("../models/order.js")).default;
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({
        status: 404,
        message: "Order not found",
      });
    }

    // ✅ Find supplier from order
    const Supplier = (await import("../models/supplier.js")).default;
    const supplier = await Supplier.findOne({
      $or: [
        { firstName: new RegExp(order.supplierName, "i") },
        { lastName: new RegExp(order.supplierName, "i") },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: order.supplierName,
              options: "i",
            },
          },
        },
        { company: new RegExp(order.supplierName, "i") },
      ],
    });

    if (!supplier) {
      return res.status(404).json({
        status: 404,
        message: "Supplier not found for this order",
      });
    }

    let normalizedBankId = null;
    try {
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (error) {
      return res.status(error.status || 400).json({
        status: error.status || 400,
        message: error.message || "Invalid bank ID",
      });
    }

    // ✅ Create new expense entry (supports multiple per order)
    const newExpense = await ExpanceIncome.create({
      date: date || new Date(),
      orderId: order._id,
      description: description || order.product,
      dueAmount: Math.round((order.purchasePrice || 0) * 100) / 100,
      paidAmount: Math.round((paidAmount || 0) * 100) / 100,
      supplierId: supplier._id,
      status: status || "pending",
      bankId: normalizedBankId,
    });

    // ✅ Populate for response
    const populatedExpense = await ExpanceIncome.findById(newExpense._id)
      .populate("orderId", "product clientName purchasePrice orderId")
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const expenseResponse = docToPlainWithBank(populatedExpense);

    return res.status(201).json({
      status: 201,
      message: "Expense entry added successfully",
      data: expenseResponse,
    });
  } catch (error) {
    console.error("Error adding expense entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Edit Income Entry
export const editIncomeEntry = async (req, res) => {
  try {
    const { incomeId } = req.params;
    const { 
      date, 
      description, 
      receivedAmount, 
      status, 
      orderId, 
      clientId, 
      bankId,
      mediatorId,
      mediatorAmount,
      isBankReceived,
      isMediatorReceived,
    } = req.body;

    if (!incomeId) {
      return res.status(400).json({
        status: 400,
        message: "incomeId is required",
      });
    }

    // Find income entry
    const income = await Income.findById(incomeId);
    if (!income) {
      return res.status(404).json({
        status: 404,
        message: "Income entry not found",
      });
    }

    // Get order reference - either from provided orderId or existing income.orderId
    const Order = (await import("../models/order.js")).default;
    let order = null;

    // Update orderId if provided
    if (orderId) {
      order = await Order.findOne({ orderId: orderId });
      if (!order) {
        return res.status(404).json({
          status: 404,
          message: "Order not found",
        });
      }
      income.orderId = order._id;
      income.sellingPrice = Math.round((order.sellingPrice || 0) * 100) / 100;
      income.Description = order.product;
    } else if (income.orderId) {
      // Use existing orderId if no new orderId provided
      order = await Order.findById(income.orderId);
    }

    // Handle mediator: use provided mediatorId or default to order's mediator if no mediatorId in income
    if (mediatorId !== undefined) {
      if (mediatorId === null || mediatorId === "") {
        income.mediator = null;
      } else {
        try {
          income.mediator = await normalizeMediatorIdOrThrow(mediatorId);
        } catch (error) {
          return res.status(error.status || 400).json({
            status: error.status || 400,
            message: error.message || "Invalid mediator ID",
          });
        }
      }
    } else if (order && order.mediator && !income.mediator) {
      // If no mediatorId provided and income doesn't have mediator, use order's mediator as default
      try {
        income.mediator = await normalizeMediatorIdOrThrow(order.mediator);
      } catch (error) {
        // If order's mediator is invalid, leave income.mediator as is
      }
    }

    // Handle mediatorAmount: normalize array if provided
    if (mediatorAmount !== undefined && mediatorAmount !== null) {
      if (Array.isArray(mediatorAmount)) {
        // Handle array of mediator amounts
        if (mediatorAmount.length === 0) {
          // Empty array provided - clear mediatorAmount and set isMediatorReceived to false
          income.mediatorAmount = [];
          income.isMediatorReceived = false;
        } else {
          try {
            income.mediatorAmount = await normalizeIncomeMediatorAmount(mediatorAmount);
            // If mediatorAmount is provided and normalized array has items, set isMediatorReceived to true
            income.isMediatorReceived = income.mediatorAmount.length > 0;
          } catch (error) {
            return res.status(error.status || 400).json({
              status: error.status || 400,
              message: error.message || "Invalid mediator amount data",
            });
          }
        }
      } else if (typeof mediatorAmount === 'number' && income.mediator) {
        // Handle single number - convert to array entry
        const roundedAmount = Math.round(mediatorAmount * 100) / 100;
        if (roundedAmount > 0) {
          income.mediatorAmount = [{
            mediatorId: income.mediator,
            amount: roundedAmount,
          }];
          // If mediatorAmount is provided as number > 0, set isMediatorReceived to true
          income.isMediatorReceived = true;
        } else {
          // Number is 0 or negative - clear mediatorAmount and set isMediatorReceived to false
          income.mediatorAmount = [];
          income.isMediatorReceived = false;
        }
      }
    } else if (isMediatorReceived !== undefined) {
      // If mediatorAmount is not provided, allow manual override of isMediatorReceived
      income.isMediatorReceived = Boolean(isMediatorReceived);
    }

    // Update clientId if provided
    if (clientId) {
      const User = (await import("../models/user.js")).default;
      const client = await User.findById(clientId);
      if (!client) {
        return res.status(404).json({
          status: 404,
          message: "Client not found",
        });
      }
      income.clientId = client._id;
    }

    // Update bank if provided
    if (bankId !== undefined) {
      try {
        income.bankId = await normalizeBankIdOrThrow(bankId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    if (isBankReceived !== undefined) {
      income.isBankReceived = Boolean(isBankReceived);
    }

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    if (receivedAmount !== undefined) income.receivedAmount = Math.round(receivedAmount * 100) / 100;

    // Auto-set receivedAmount when status is updated to paid or done
    if (status) {
      income.status = status;
      if (status === "paid" || status === "done") {
        income.receivedAmount = Math.round((income.sellingPrice || 0) * 100) / 100;
        income.isBankReceived = true;
      }
    }

    await income.save();

    const populatedIncome = await Income.findById(income._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediator",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediatorAmount.mediatorId",
        select: "_id name",
        match: { isDeleted: false },
      });

    // Format mediatorAmount details
    const incomeResponse = docToPlainWithBank(populatedIncome);
    if (incomeResponse.mediatorAmount && Array.isArray(incomeResponse.mediatorAmount)) {
      const mediatorDetails = populatedIncome.mediatorAmount
        .map((item) => item.mediatorId)
        .filter((m) => m && typeof m === "object");
      incomeResponse.mediatorAmount = formatMediatorAmountDetails(
        incomeResponse.mediatorAmount,
        mediatorDetails
      );
    }

    // Format mediator
    if (incomeResponse.mediator) {
      if (typeof incomeResponse.mediator === 'object' && incomeResponse.mediator._id) {
        incomeResponse.mediator = {
          _id: incomeResponse.mediator._id,
          name: incomeResponse.mediator.name || null,
        };
      } else {
        incomeResponse.mediator = null;
      }
    }

    return res.status(200).json({
      status: 200,
      message: "Income entry updated successfully",
      data: incomeResponse,
    });
  } catch (error) {
    console.error("Error updating income entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Edit Expanse Entry 
export const editExpanseEntry = async (req, res) => {
  try {
    const { ExpId } = req.params;
    const { date, description, paidAmount, status, bankId } = req.body;

    // Find existing expense
    const existingExpense = await ExpanceIncome.findById(ExpId)
      .populate("orderId")
      .populate("supplierId");

    if (!existingExpense) {
      return res.status(404).json({ message: "Expense entry not found" });
    }

    // Optional: verify that linked order & supplier still exist
    if (!existingExpense.orderId || !existingExpense.supplierId) {
      return res.status(400).json({ message: "Invalid linked order or supplier" });
    }

    // Update fields
    if (date) existingExpense.date = date;
    if (description) existingExpense.description = description;
    if (paidAmount !== undefined) existingExpense.paidAmount = Math.round(paidAmount * 100) / 100;
    if (status) existingExpense.status = status;

    if (bankId !== undefined) {
      try {
        existingExpense.bankId = await normalizeBankIdOrThrow(bankId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    // Recalculate remaining amount
    existingExpense.remainingAmount =
      Math.round(((existingExpense.dueAmount || 0) - (existingExpense.paidAmount || 0)) * 100) / 100;

    // Save updated document
    await existingExpense.save();

    const populatedExpense = await ExpanceIncome.findById(ExpId)
      .populate("orderId", "product clientName purchasePrice orderId")
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const expenseResponse = docToPlainWithBank(populatedExpense);

    return res.status(200).json({
      message: "Expense entry updated successfully",
      data: expenseResponse,
    });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


// Update Income Payment Status
export const updateIncomePaymentStatus = async (req, res) => {
  try {
    const { 
      incomeId, 
      date, 
      description, 
      receivedAmount, 
      bankId,
      mediatorId,
      mediatorAmount
    } = req.body;

    if (!incomeId) {
      return res.status(400).json({
        status: 400,
        message: "incomeId is required",
      });
    }

    // Find income entry
    const income = await Income.findById(incomeId);
    if (!income) {
      return res.status(404).json({
        status: 404,
        message: "Income entry not found",
      });
    }

    // Check if status is already reserved - cannot be changed once reserved
    if (income.status === "reserved") {
      const populatedIncome = await Income.findById(income._id)
        .populate("orderId", "product clientName sellingPrice orderId")
        .populate("clientId", "firstName lastName")
        .populate({
          path: "mediator",
          select: "_id name",
          match: { isDeleted: false },
        })
        .populate({
          path: "mediatorAmount.mediatorId",
          select: "_id name",
          match: { isDeleted: false },
        });

      return res.status(201).json({
        status: 201,
        message: "This ID status is already RESERVED and cannot be changed",
        data: populatedIncome,
      });
    }

    // Allow update if current status is "pending" or "processing"
    if (income.status !== "pending" && income.status !== "processing") {
      return res.status(400).json({
        status: 400,
        message: `Cannot update payment status. Current status is "${income.status}". Only "pending" or "processing" status can be updated.`,
      });
    }

    // Determine which status to set based on provided fields
    const hasReceivedAmountAndBank = receivedAmount !== undefined && bankId !== undefined;
    const hasMediatorData = mediatorId !== undefined || mediatorAmount !== undefined;
    
    // Scenario 1: Only mediatorId and mediatorAmount provided (without receivedAmount and bankId) -> PROCESSING
    // Scenario 2: All fields including receivedAmount, bankId, mediatorId, mediatorAmount -> RESERVED
    
    let targetStatus = "reserved"; // Default to RESERVED (old behavior)
    let targetMessage = "Income payment status updated to RESERVED successfully";
    
    if (hasMediatorData && !hasReceivedAmountAndBank) {
      // Only mediator data provided without receivedAmount and bankId -> PROCESSING
      targetStatus = "processing";
      targetMessage = "Income payment status updated to PROCESSING successfully";
    } else if (hasReceivedAmountAndBank && hasMediatorData) {
      // All fields provided -> RESERVED
      targetStatus = "reserved";
      targetMessage = "Income payment status updated to RESERVED successfully";
    } else if (hasReceivedAmountAndBank && !hasMediatorData) {
      // Old behavior: only receivedAmount and bankId -> RESERVED
      targetStatus = "reserved";
      targetMessage = "Income payment status updated to RESERVED successfully";
    }

    // Validate receivedAmount if provided
    if (receivedAmount !== undefined) {
      if (typeof receivedAmount !== 'number' || receivedAmount < 0) {
        return res.status(400).json({
          status: 400,
          message: "receivedAmount must be a positive number",
        });
      }
      income.receivedAmount = Math.round(receivedAmount * 100) / 100;
    }

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    
    if (bankId !== undefined) {
      try {
        income.bankId = await normalizeBankIdOrThrow(bankId);
        income.isBankReceived = true;
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    // Handle mediator: use provided mediatorId or default to order's mediator
    if (mediatorId !== undefined) {
      if (mediatorId === null || mediatorId === "") {
        income.mediator = null;
      } else {
        try {
          income.mediator = await normalizeMediatorIdOrThrow(mediatorId);
        } catch (error) {
          return res.status(error.status || 400).json({
            status: error.status || 400,
            message: error.message || "Invalid mediator ID",
          });
        }
      }
    }

    // Handle mediatorAmount: normalize array if provided
    if (mediatorAmount !== undefined && mediatorAmount !== null) {
      if (Array.isArray(mediatorAmount)) {
        // Handle array of mediator amounts
        if (mediatorAmount.length === 0) {
          // Empty array provided - clear mediatorAmount and set isMediatorReceived to false
          income.mediatorAmount = [];
          income.isMediatorReceived = false;
        } else {
          try {
            income.mediatorAmount = await normalizeIncomeMediatorAmount(mediatorAmount);
            // If mediatorAmount is provided and normalized array has items, set isMediatorReceived to true
            income.isMediatorReceived = income.mediatorAmount.length > 0;
          } catch (error) {
            return res.status(error.status || 400).json({
              status: error.status || 400,
              message: error.message || "Invalid mediator amount data",
            });
          }
        }
      } else if (typeof mediatorAmount === 'number' && income.mediator) {
        // Handle single number - convert to array entry
        const roundedAmount = Math.round(mediatorAmount * 100) / 100;
        if (roundedAmount > 0) {
          income.mediatorAmount = [{
            mediatorId: income.mediator,
            amount: roundedAmount,
          }];
          // If mediatorAmount is provided as number > 0, set isMediatorReceived to true
          income.isMediatorReceived = true;
        } else {
          // Number is 0 or negative - clear mediatorAmount and set isMediatorReceived to false
          income.mediatorAmount = [];
          income.isMediatorReceived = false;
        }
      }
    }

    // Update status based on scenario
    income.status = targetStatus;

    await income.save();

    const populatedIncome = await Income.findById(income._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediator",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediatorAmount.mediatorId",
        select: "_id name",
        match: { isDeleted: false },
      });

    // Format mediator and mediatorAmount
    const incomeResponse = docToPlainWithBank(populatedIncome);
    
    // Format mediator
    if (incomeResponse.mediator) {
      if (typeof incomeResponse.mediator === 'object' && incomeResponse.mediator._id) {
        incomeResponse.mediator = {
          _id: incomeResponse.mediator._id,
          name: incomeResponse.mediator.name || null,
        };
      } else {
        incomeResponse.mediator = null;
      }
    }

    // Format mediatorAmount
    if (incomeResponse.mediatorAmount && Array.isArray(incomeResponse.mediatorAmount)) {
      const mediatorDetails = populatedIncome.mediatorAmount
        .map((item) => item.mediatorId)
        .filter((m) => m && typeof m === "object");
      incomeResponse.mediatorAmount = formatMediatorAmountDetails(
        incomeResponse.mediatorAmount,
        mediatorDetails
      );
    }

    return res.status(200).json({
      status: 200,
      message: targetMessage,
      data: incomeResponse,
    });
  } catch (error) {
    console.error("Error updating income payment status:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Add Extra Expense (without order/supplier)
export const addExtraExpense = async (req, res) => {
  try {
    const { date, description, paidAmount, bankId } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({
        status: 400,
        message: "description is required",
      });
    }

    if (paidAmount === undefined || paidAmount === null) {
      return res.status(400).json({
        status: 400,
        message: "paidAmount is required",
      });
    }

    // Validate paidAmount
    if (typeof paidAmount !== 'number' || paidAmount < 0) {
      return res.status(400).json({
        status: 400,
        message: "paidAmount must be a positive number",
      });
    }

    let normalizedBankId = null;
    try {
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (error) {
      return res.status(error.status || 400).json({
        status: error.status || 400,
        message: error.message || "Invalid bank ID",
      });
    }

    // Create new expense entry without orderId and supplierId
    const newExpense = await ExpanceIncome.create({
      date: date || new Date(),
      description: description,
      paidAmount: Math.round(paidAmount * 100) / 100,
      dueAmount: 0,
      bankId: normalizedBankId,
      status: "paid", // Direct paid status
    });

    const populatedExpense = await ExpanceIncome.findById(newExpense._id)
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const expenseResponse = docToPlainWithBank(populatedExpense);

    return res.status(201).json({
      status: 201,
      message: "Extra expense added successfully",
      data: expenseResponse,
    });
  } catch (error) {
    console.error("Error adding extra expense:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Edit Extra Expense (only if orderId doesn't exist)
export const editExtraExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { date, description, paidAmount, bankId } = req.body;

    if (!expenseId) {
      return res.status(400).json({
        status: 400,
        message: "expenseId is required",
      });
    }

    // Find expense entry
    const expense = await ExpanceIncome.findById(expenseId);
    if (!expense) {
      return res.status(404).json({
        status: 404,
        message: "Expense entry not found",
      });
    }

    // Check if orderId exists - if yes, cannot edit
    if (expense.orderId) {
      return res.status(400).json({
        status: 400,
        message: "Cannot edit this expense. This expense is linked to an order. Only standalone expenses can be edited.",
      });
    }

    // Update fields if provided
    if (date) expense.date = date;
    if (description) expense.description = description;
    if (bankId !== undefined) {
      try {
        expense.bankId = await normalizeBankIdOrThrow(bankId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    if (paidAmount !== undefined) {
      if (typeof paidAmount !== 'number' || paidAmount < 0) {
        return res.status(400).json({
          status: 400,
          message: "paidAmount must be a positive number",
        });
      }
      expense.paidAmount = Math.round(paidAmount * 100) / 100;
    }

    await expense.save();

    const populatedExpense = await ExpanceIncome.findById(expenseId)
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const expenseResponse = docToPlainWithBank(populatedExpense);

    return res.status(200).json({
      status: 200,
      message: "Extra expense updated successfully",
      data: expenseResponse,
    });
  } catch (error) {
    console.error("Error updating extra expense:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Get Single Expense by ID
export const getExpenseById = async (req, res) => {
  try {
    const { expenseId } = req.params;

    if (!expenseId) {
      return res.status(400).json({
        status: 400,
        message: "expenseId is required",
      });
    }

    // Find expense entry and populate related data
    const expense = await ExpanceIncome.findById(expenseId)
      .populate("orderId", "product clientName purchasePrice orderId")
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    if (!expense) {
      return res.status(404).json({
        status: 404,
        message: "Expense entry not found",
      });
    }

    // Format response
    const { bankId: expenseBankId, bank: expenseBank } = buildBankResponse(expense.bankId);

    const formattedExpense = {
      _id: expense._id,
      date: expense.date || expense.createdAt,
      orderId: expense.orderId,
      description: expense.description,
      paidAmount: Math.round((expense.paidAmount || 0) * 100) / 100,
      dueAmount: Math.round((expense.dueAmount || 0) * 100) / 100,
      supplierId: expense.supplierId,
      supplierName: expense.supplierId
        ? `${expense.supplierId.firstName || ""} ${expense.supplierId.lastName || ""}`.trim() ||
        expense.supplierId.company ||
        ""
        : "",
      clientName: expense.orderId?.clientName || "",
      product: expense.orderId?.product || "",
      status: expense.status,
      bankId: expenseBankId,
      bank: expenseBank,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };

    return res.status(200).json({
      status: 200,
      message: "Expense fetched successfully",
      data: formattedExpense,
    });
  } catch (error) {
    console.error("Error fetching expense by ID:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Add Extra Income (without order/client)
export const addExtraIncome = async (req, res) => {
  try {
    const { date, description, receivedAmount, bankId } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({
        status: 400,
        message: "description is required",
      });
    }

    if (receivedAmount === undefined || receivedAmount === null) {
      return res.status(400).json({
        status: 400,
        message: "receivedAmount is required",
      });
    }

    // Validate receivedAmount
    if (typeof receivedAmount !== 'number' || receivedAmount < 0) {
      return res.status(400).json({
        status: 400,
        message: "receivedAmount must be a positive number",
      });
    }

    let normalizedBankId = null;
    try {
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (error) {
      return res.status(error.status || 400).json({
        status: error.status || 400,
        message: error.message || "Invalid bank ID",
      });
    }

    // Create new income entry without orderId and clientId
    const roundedAmount = Math.round(receivedAmount * 100) / 100;
    const newIncome = await Income.create({
      date: date || new Date(),
      Description: description,
      receivedAmount: roundedAmount,
      sellingPrice: roundedAmount, // Set sellingPrice equal to receivedAmount for standalone income
      bankId: normalizedBankId,
      status: "paid", // Automatically set status to paid
    });

    const populatedIncome = await Income.findById(newIncome._id)
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const incomeResponse = docToPlainWithBank(populatedIncome);

    return res.status(201).json({
      status: 201,
      message: "Extra income added successfully",
      data: incomeResponse,
    });
  } catch (error) {
    console.error("Error adding extra income:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Edit Extra Income (only if orderId doesn't exist)
export const editExtraIncome = async (req, res) => {
  try {
    const { incomeId } = req.params;
    const { date, description, receivedAmount, bankId } = req.body;

    if (!incomeId) {
      return res.status(400).json({
        status: 400,
        message: "incomeId is required",
      });
    }

    // Find income entry
    const income = await Income.findById(incomeId);
    if (!income) {
      return res.status(404).json({
        status: 404,
        message: "Income entry not found",
      });
    }

    // Check if orderId exists - if yes, cannot edit
    if (income.orderId) {
      return res.status(400).json({
        status: 400,
        message: "Cannot edit this income. This income is linked to an order. Only standalone income can be edited.",
      });
    }

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    if (bankId !== undefined) {
      try {
        income.bankId = await normalizeBankIdOrThrow(bankId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    if (receivedAmount !== undefined) {
      if (typeof receivedAmount !== 'number' || receivedAmount < 0) {
        return res.status(400).json({
          status: 400,
          message: "receivedAmount must be a positive number",
        });
      }
      const roundedAmount = Math.round(receivedAmount * 100) / 100;
      income.receivedAmount = roundedAmount;
      income.sellingPrice = roundedAmount; // Keep sellingPrice in sync
    }

    await income.save();

    const populatedIncome = await Income.findById(incomeId).populate({
      path: "bankId",
      select: "_id name",
      match: { isDeleted: false },
    });

    const incomeResponse = docToPlainWithBank(populatedIncome);

    return res.status(200).json({
      status: 200,
      message: "Extra income updated successfully",
      data: incomeResponse,
    });
  } catch (error) {
    console.error("Error updating extra income:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Get Single Income by ID
export const getIncomeById = async (req, res) => {
  try {
    const { incomeId } = req.params;

    if (!incomeId) {
      return res.status(400).json({
        status: 400,
        message: "incomeId is required",
      });
    }

    // Find income entry and populate related data
    const income = await Income.findById(incomeId)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediator",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "mediatorAmount.mediatorId",
        select: "_id name",
        match: { isDeleted: false },
      });

    if (!income) {
      return res.status(404).json({
        status: 404,
        message: "Income entry not found",
      });
    }

    // Format response
    const { bankId: incomeBankId, bank: incomeBank } = buildBankResponse(income.bankId);

    // Format mediator
    let formattedMediator = null;
    if (income.mediator) {
      if (typeof income.mediator === 'object' && income.mediator._id) {
        formattedMediator = {
          _id: income.mediator._id,
          name: income.mediator.name || null,
        };
      } else {
        formattedMediator = null;
      }
    }

    // Format mediatorAmount
    let formattedMediatorAmount = [];
    if (income.mediatorAmount && Array.isArray(income.mediatorAmount)) {
      const mediatorDetails = income.mediatorAmount
        .map((item) => item.mediatorId)
        .filter((m) => m && typeof m === "object");
      formattedMediatorAmount = formatMediatorAmountDetails(
        income.mediatorAmount,
        mediatorDetails
      );
    }

    const formattedIncome = {
      _id: income._id,
      date: income.date,
      orderId: income.orderId,
      description: income.Description,
      sellingPrice: Math.round((income.sellingPrice || 0) * 100) / 100,
      receivedAmount: Math.round((income.receivedAmount || 0) * 100) / 100,
      clientId: income.clientId,
      clientName: income.orderId?.clientName ||
        (income.clientId ? `${income.clientId.firstName || ""} ${income.clientId.lastName || ""}`.trim() : ""),
      product: income.orderId?.product || "",
      status: income.status,
      bankId: incomeBankId,
      bank: incomeBank,
      mediator: formattedMediator,
      mediatorAmount: formattedMediatorAmount,
      isBankReceived: Boolean(income.isBankReceived),
      isMediatorReceived: Boolean(income.isMediatorReceived),
      createdAt: income.createdAt,
      updatedAt: income.updatedAt,
    };

    return res.status(200).json({
      status: 200,
      message: "Income fetched successfully",
      data: formattedIncome,
    });
  } catch (error) {
    console.error("Error fetching income by ID:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default {
  getIncomeExpance,
  addIncomeEntry,
  addExpanseEntry,
  editIncomeEntry,
  editExpanseEntry,
  updateIncomePaymentStatus,
  addExtraExpense,
  editExtraExpense,
  getExpenseById,
  addExtraIncome,
  editExtraIncome,
  getIncomeById
};
