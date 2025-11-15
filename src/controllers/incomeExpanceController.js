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

    let data = [];
    let total = 0;

    // ====================== CASE 1: INCOME ======================
    if (incExpType == 1) {
      const incomeData = await Income.find({ ...searchQuery, ...orderFilter })
        .populate("orderId", "product clientName sellingPrice orderId initialPayment")
        .populate("clientId", "firstName lastName")
        .populate({
          path: "bankId",
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
        return {
          _id: item._id,
          incExpType: 1,
          date: item.date,
          orderId: item.orderId,
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
        };
      });

      total = count;
    }

    // ====================== CASE 2: EXPENSE ======================
    else if (incExpType == 2) {
      const expanceData = await ExpanceIncome.find({ ...searchQuery, ...orderFilter })
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

      const [incomeData, expanceData] = await Promise.all([
        Income.find(finalQuery)
          .populate("orderId", "product clientName sellingPrice orderId initialPayment")
          .populate("clientId", "firstName lastName")
          .populate({
            path: "bankId",
            select: "_id name",
            match: { isDeleted: false },
          })
          .sort(sortQuery)
          .lean(),
        ExpanceIncome.find(finalQuery)
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
        return {
          _id: item._id,
          incExpType: 1,
          date: item.date,
          orderId: item.orderId,
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
    });

    const populatedIncome = await Income.findById(newIncome._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const incomeResponse = docToPlainWithBank(populatedIncome);

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
    const { date, description, receivedAmount, status, orderId, clientId, bankId } = req.body;

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

    // Update orderId if provided
    if (orderId) {
      const Order = (await import("../models/order.js")).default;
      const order = await Order.findOne({ orderId: orderId });
      if (!order) {
        return res.status(404).json({
          status: 404,
          message: "Order not found",
        });
      }
      income.orderId = order._id;
      income.sellingPrice = Math.round((order.sellingPrice || 0) * 100) / 100;
      income.Description = order.product;
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

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    if (receivedAmount !== undefined) income.receivedAmount = Math.round(receivedAmount * 100) / 100;

    // Auto-set receivedAmount when status is updated to paid or done
    if (status) {
      income.status = status;
      if (status === "paid" || status === "done") {
        income.receivedAmount = Math.round((income.sellingPrice || 0) * 100) / 100;
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
      });

    const incomeResponse = docToPlainWithBank(populatedIncome);

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
    const { incomeId, date, description, receivedAmount, bankId } = req.body;

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

    // Check if status is already reserved
    if (income.status === "reserved") {
      const populatedIncome = await Income.findById(income._id)
        .populate("orderId", "product clientName sellingPrice orderId")
        .populate("clientId", "firstName lastName");

      return res.status(201).json({
        status: 201,
        message: "This ID status is already reserved",
        data: populatedIncome,
      });
    }

    // Only allow update if current status is "pending"
    if (income.status !== "pending") {
      return res.status(400).json({
        status: 400,
        message: `Cannot update payment status. Current status is "${income.status}". Only "pending" status can be updated to "reserved".`,
      });
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
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    // Update status from "pending" to "reserved"
    income.status = "reserved";

    await income.save();

    const populatedIncome = await Income.findById(income._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const incomeResponse = docToPlainWithBank(populatedIncome);

    return res.status(200).json({
      status: 200,
      message: "Income payment status updated to RESERVED successfully",
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
      });

    if (!income) {
      return res.status(404).json({
        status: 404,
        message: "Income entry not found",
      });
    }

    // Format response
    const { bankId: incomeBankId, bank: incomeBank } = buildBankResponse(income.bankId);

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
