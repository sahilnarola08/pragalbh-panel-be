import Income from "../models/income.js";
import ExpanceIncome from "../models/expance_inc.js";

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

    // Build search query
    const searchQuery = {};
    
    // Add text search if provided
    if (search) {
      searchQuery.$or = [
        { Description: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    
    // Filter by orderId if provided
    let orderFilter = {};
    if (orderId) {
      // Find order by orderId field
      const Order = (await import("../models/order.js")).default;
      const order = await Order.findOne({ orderId: orderId });
      if (order) {
        orderFilter = { orderId: order._id };
      } else {
        // If order not found, return empty result
        return res.status(200).json({
          status: 200,
          message: "No records found for the given orderId",
          data: {
            total: 0,
            page,
            limit,
            items: [],
          },
        });
      }
    }

    let data = [];
    let total = 0;

    // Case 1: Income Only
    if (incExpType == 1) {
      const incomeData = await Income.find(searchQuery)
        .populate("orderId", "product clientName sellingPrice orderId")
        .populate("clientId", "firstName lastName")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit);

      const count = await Income.countDocuments(searchQuery);

      data = incomeData.map((item) => ({
        _id: item._id,
        incExpType: 1,
        date: item.date,
        orderId: item.orderId,
        description: item.Description || item.orderId?.product || "",
        product: item.orderId?.product || "",
        sellingPrice: item.orderId?.sellingPrice || item.sellingPrice || 0,
        receivedAmount: item.receivedAmount || 0,
        clientName:
          item.orderId?.clientName ||
          `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
        status: item.status,
        bankId: item.bankId || null,
      }));

      total = count;
    }

    // Case 2: Expense Only
    else if (incExpType == 2) {
      const expanceData = await ExpanceIncome.find(searchQuery)
        .populate("orderId", "product clientName purchasePrice orderId")
        .populate("supplierId", "firstName lastName company")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit);

      const count = await ExpanceIncome.countDocuments(searchQuery);
      data = expanceData.map((item) => ({
        _id: item._id,
        incExpType: 2,
        date: item.date || item.createdAt,
        orderId: item.orderId,
        description: item.description || item.orderId?.product || "",
        dueAmount: item.orderId?.purchasePrice || item.dueAmount || 0,
        clientName: item.orderId?.clientName || "",
        paidAmount: item.paidAmount || 0,
        supplierName:
          `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
          item.supplierId?.company ||
          "",
        status: item.status,
        bankId: item.bankId || null,
      }));

      total = count;
    }

    // Case 3: Income + Expense Both
    else if (incExpType == 3) {
      const finalQuery = { ...searchQuery, ...orderFilter };
      const [incomeData, expanceData] = await Promise.all([
        Income.find(finalQuery)
          .populate("orderId", "product clientName sellingPrice orderId")
          .populate("clientId", "firstName lastName")
          .sort(sortQuery),
        ExpanceIncome.find(finalQuery)
          .populate("orderId", "product clientName purchasePrice orderId")
          .populate("supplierId", "firstName lastName company")
          .sort(sortQuery),
      ]);

      const incomeList = incomeData.map((item) => ({
        _id: item._id,
        incExpType: 1,
        date: item.date,
        orderId: item.orderId,
        description: item.Description || item.orderId?.product || "",
        product: item.orderId?.product || "",
        sellingPrice: item.orderId?.sellingPrice || item.sellingPrice || 0,
        receivedAmount: item.receivedAmount || 0,
        clientName:
          item.orderId?.clientName ||
          `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
        status: item.status,
        bankId: item.bankId || null,
      }));

      const expanceList = expanceData.map((item) => ({
        _id: item._id,
        incExpType: 2,
        date: item.date || item.createdAt,
        orderId: item.orderId,
        description: item.description || item.orderId?.product || "",
        dueAmount: item.orderId?.purchasePrice || item.dueAmount || 0,
        clientName: item.orderId?.clientName || "",
        paidAmount: item.paidAmount || 0,
        supplierName:
          `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
          item.supplierId?.company ||
          "",
        status: item.status,
        bankId: item.bankId || null,
      }));

      const merged = [...incomeList, ...expanceList].sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        return sortOrder === "asc" ? da - db : db - da;
      });
      
      total = merged.length;
      data = merged.slice(skip, skip + limit);
    }

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

    // Create new income entry - automatically use order's data
    // Multiple income entries allowed per order (for installment payments)
    const newIncome = await Income.create({
      date: date || new Date(),
      orderId: order._id,
      Description: description || order.product,
      sellingPrice: order.sellingPrice,
      receivedAmount: receivedAmount || 0,
      clientId: client._id,
      status: status || "pending",
    });

    const populatedIncome = await Income.findById(newIncome._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName");

    return res.status(201).json({
      status: 201,
      message: "Income entry added successfully",
      data: populatedIncome,
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

// Edit Income Entry
export const editIncomeEntry = async (req, res) => {
  try {
    const { incomeId } = req.params;
    const { date, description, receivedAmount, status, orderId, clientId } = req.body;

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
      income.sellingPrice = order.sellingPrice;
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

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    if (receivedAmount !== undefined) income.receivedAmount = receivedAmount;
    
    // Auto-set receivedAmount when status is updated to paid or done
    if (status) {
      income.status = status;
      if (status === "paid" || status === "done") {
        income.receivedAmount = income.sellingPrice;
      }
    }

    await income.save();

    const populatedIncome = await Income.findById(income._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName");

    return res.status(200).json({
      status: 200,
      message: "Income entry updated successfully",
      data: populatedIncome,
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
      income.receivedAmount = receivedAmount;
    }

    // Update fields if provided
    if (date) income.date = date;
    if (description) income.Description = description;
    if (bankId) income.bankId = bankId;

    // Update status from "pending" to "reserved"
    income.status = "reserved";

    await income.save();

    const populatedIncome = await Income.findById(income._id)
      .populate("orderId", "product clientName sellingPrice orderId")
      .populate("clientId", "firstName lastName");

    return res.status(200).json({
      status: 200,
      message: "Income payment status updated to RESERVED successfully",
      data: populatedIncome,
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

    // Create new expense entry without orderId and supplierId
    const newExpense = await ExpanceIncome.create({
      date: date || new Date(),
      description: description,
      paidAmount: paidAmount,
      dueAmount: 0,
      bankId: bankId || null,
      status: "paid", // Direct paid status
    });

    return res.status(201).json({
      status: 201,
      message: "Extra expense added successfully",
      data: newExpense,
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
    if (bankId !== undefined) expense.bankId = bankId;
    
    if (paidAmount !== undefined) {
      if (typeof paidAmount !== 'number' || paidAmount < 0) {
        return res.status(400).json({
          status: 400,
          message: "paidAmount must be a positive number",
        });
      }
      expense.paidAmount = paidAmount;
    }

    await expense.save();

    return res.status(200).json({
      status: 200,
      message: "Extra expense updated successfully",
      data: expense,
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
      .populate("supplierId", "firstName lastName company");

    if (!expense) {
      return res.status(404).json({
        status: 404,
        message: "Expense entry not found",
      });
    }

    // Format response
    const formattedExpense = {
      _id: expense._id,
      date: expense.date || expense.createdAt,
      orderId: expense.orderId,
      description: expense.description,
      paidAmount: expense.paidAmount || 0,
      dueAmount: expense.dueAmount || 0,
      supplierId: expense.supplierId,
      supplierName: expense.supplierId
        ? `${expense.supplierId.firstName || ""} ${expense.supplierId.lastName || ""}`.trim() ||
          expense.supplierId.company ||
          ""
        : "",
      clientName: expense.orderId?.clientName || "",
      product: expense.orderId?.product || "",
      status: expense.status,
      bankId: expense.bankId || null,
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

export default { 
  getIncomeExpance, 
  addIncomeEntry, 
  editIncomeEntry, 
  updateIncomePaymentStatus,
  addExtraExpense,
  editExtraExpense,
  getExpenseById
};
