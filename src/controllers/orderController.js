import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { ORDER_STATUS, DEFAULT_ORDER_STATUS } from "../helper/enums.js";
import Product from "../models/product.js";
import User from "../models/user.js";
import Supplier from "../models/supplier.js";
import mongoose from "mongoose";
import Income from "../models/income.js";
import ExpanseIncome from "../models/expance_inc.js";
import { DEFAULT_PAYMENT_STATUS } from "../helper/enums.js";
import Master from "../models/master.js";
import { formatCurrency } from "../util/currencyFormat.js";

const DEFAULT_ORDER_IMAGE_PLACEHOLDER =
  "https://placehold.co/100x100/A0B2C7/FFFFFF?text=Product";

// extract product images
const extractProductImages = (input, { fallback } = { fallback: false }) => {
  if (input === undefined || input === null) {
    return fallback ? [{ img: DEFAULT_ORDER_IMAGE_PLACEHOLDER }] : undefined;
  }

  const arrayInput = Array.isArray(input) ? input : [input];

  const normalized = arrayInput
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed ? { img: trimmed } : null;
      }

      if (typeof item === "object" && item !== null) {
        const candidate =
          item.img ??
          item.url ??
          item.imageUrl ??
          item.relativePath ??
          item.path;

        if (typeof candidate === "string" && candidate.trim()) {
          return { img: candidate.trim() };
        }
      }

      return null;
    })
    .filter(Boolean);

  if (normalized.length) {
    return normalized;
  }

  return fallback ? [{ img: DEFAULT_ORDER_IMAGE_PLACEHOLDER }] : undefined;
};

// sanitize order platform values
const sanitizeOrderPlatformValues = async () => {
  await Order.updateMany(
    { orderPlatform: { $type: "string" } },
    { $unset: { orderPlatform: "" } }
  );
};

// normalize master id or throw error
const normalizeMasterIdOrThrow = async (id, fieldName = "masterId") => {
  if (!id) {
    const error = new Error(`${fieldName} is required`);
    error.status = 400;
    throw error;
  }

  const rawId =
    typeof id === "object" && id !== null ? id._id || id.id || id.toString() : id;

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error(`${fieldName} must be a valid ObjectId`);
    error.status = 400;
    throw error;
  }

  const master = await Master.findOne({
    _id: rawId,
    isDeleted: false,
  }).select("_id name");

  if (!master) {
    const error = new Error(`${fieldName} not found or inactive`);
    error.status = 404;
    throw error;
  }

  return master;
};
// create order
export const createOrder = async (req, res, next) => {
  try {
    const {
      clientName,
      address,
      product,
      productImages,
      productImage,
      orderDate,
      dispatchDate,
      purchasePrice,
      sellingPrice,
      initialPayment,
      bankName,
      paymentAmount,
      supplier,
      orderPlatform,
      otherDetails
    } = req.body;

    // ✅ Validate client existence
    const existingClient = await User.findOne({
      $or: [
        { firstName: new RegExp(clientName, "i") },
        { lastName: new RegExp(clientName, "i") },
        { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: clientName, options: "i" } } }
      ]
    });

    if (!existingClient) {
      return sendErrorResponse({
        res,
        message: `Client "${clientName}" does not exist. Please add client first.`,
        status: 400,
      });
    }

    // ✅ Validate product existence
    const existingProduct = await Product.findOne({
      productName: new RegExp(product, "i")
    });

    if (!existingProduct) {
      return sendErrorResponse({
        res,
        message: `Product "${product}" does not exist. Please add product first.`,
        status: 400,
      });
    }

    let supplierName = supplier?.trim() || "";
    let existingSupplier = null;

    if (supplierName) {
      existingSupplier = await Supplier.findOne({
        $or: [
          { firstName: new RegExp(supplierName, "i") },
          { lastName: new RegExp(supplierName, "i") },
          { company: new RegExp(supplierName, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: supplierName, options: "i" } } }
        ]
      });

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier "${supplierName}" does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    let orderPlatformMaster;
    try {
      orderPlatformMaster = await normalizeMasterIdOrThrow(orderPlatform, "orderPlatform");
    } catch (error) {
      return sendErrorResponse({
        res,
        message: error.message || "Invalid order platform",
        status: error.status || 400,
      });
    }

    const normalizedProductImages = extractProductImages(
      productImages ?? productImage,
      { fallback: true }
    );

    // The order status will automatically be set to 'pending' because we updated the enums file.
    const order = await Order.create({
      clientName,
      address,
      product,
      productImages: normalizedProductImages,
      orderDate,
      dispatchDate,
      purchasePrice: Math.round((purchasePrice || 0) * 100) / 100,
      sellingPrice: Math.round((sellingPrice || 0) * 100) / 100,
      initialPayment: Math.round((initialPayment || 0) * 100) / 100,
      bankName,
      paymentAmount: paymentAmount !== undefined && paymentAmount !== null ? Math.round(paymentAmount * 100) / 100 : paymentAmount,
      supplier,
      orderPlatform: orderPlatformMaster._id,
      otherDetails,
      trackingId: "",
      courierCompany: "",
      status: DEFAULT_ORDER_STATUS,
    });

    // Create related Income record
    await Income.create({
      date: new Date(), 
      orderId: order._id, 
      Description: order.product, 
      sellingPrice: Math.round((order.sellingPrice || 0) * 100) / 100,
      costPrice: Math.round((order.purchasePrice || 0) * 100) / 100,
      receivedAmount: 0, 
      clientId: existingClient._id,
      status: DEFAULT_PAYMENT_STATUS,
    });


     // Create ExpenseIncome record (supplier side)
     if (existingSupplier) {
      await ExpanseIncome.create({
        orderId: order._id,
        description: order.product,
        paidAmount: 0,
        dueAmount: Math.round((order.purchasePrice || 0) * 100) / 100,
        supplierId: existingSupplier._id,
        status: DEFAULT_PAYMENT_STATUS,
      });
    }

    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: "orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      });

    return sendSuccessResponse({
      res,
      data: populatedOrder,
      message: "Order created successfully",
      status: 200
    });
  } catch (err) {
    console.error("Error creating order:", err);
    return sendErrorResponse({
      res,
      message: "Failed to create order",
      status: 500
    });
  }
};

// Get All Orders
const getAllOrders = async (req, res) => {
  try {
    await sanitizeOrderPlatformValues();

    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "createdAt",
      sortOrder = "desc",
      status = "",
      startDate = "",
      endDate = ""
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Sorting
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Search filter
    const filter = {};
    const trimmedSearch = (search || "").trim();
    let matchingPlatformIds = [];

    if (trimmedSearch) {
      matchingPlatformIds = await Master.find({
        name: new RegExp(trimmedSearch, "i"),
        isDeleted: false,
      }).select("_id");

      const searchRegex = new RegExp(trimmedSearch, "i");
      const orConditions = [
        { clientName: searchRegex },
        { address: searchRegex },
        { product: searchRegex },
        { supplier: searchRegex },
      ];

      if (mongoose.Types.ObjectId.isValid(trimmedSearch)) {
        orConditions.push({ orderPlatform: trimmedSearch });
      }

      if (matchingPlatformIds.length > 0) {
        orConditions.push({
          orderPlatform: { $in: matchingPlatformIds.map((item) => item._id) },
        });
      }

      filter.$or = orConditions;
    }

    // Add status filter if provided in the query
    if (status) {
      filter.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.orderDate = {};

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
        if (start) {
          filter.orderDate.$gte = start;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid startDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }

      if (endDate) {
        const end = parseDate(endDate);
        if (end) {
          end.setHours(23, 59, 59, 999); // End of day
          filter.orderDate.$lte = end;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }
    }

    const orders = await Order.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limitNum)
      .populate({
        path: "orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();

    // Calculate income, expense, and net profit per order
    const incomeMap = new Map();
    const expenseMap = new Map();

    if (orders.length > 0) {
      const orderIds = orders
        .map((order) => order?._id)
        .filter((id) => !!id);

      if (orderIds.length > 0) {
        const [incomeTotals, expenseTotals] = await Promise.all([
          Income.aggregate([
            {
              $match: {
                orderId: { $in: orderIds },
              },
            },
            {
              $group: {
                _id: "$orderId",
                totalIncome: {
                  $sum: { $ifNull: ["$receivedAmount", 0] },
                },
              },
            },
          ]),
          ExpanseIncome.aggregate([
            {
              $match: {
                orderId: { $in: orderIds },
              },
            },
            {
              $group: {
                _id: "$orderId",
                totalExpense: {
                  $sum: { $ifNull: ["$paidAmount", 0] },
                },
              },
            },
          ]),
        ]);

        incomeTotals.forEach((item) => {
          if (!item?._id) return;
          incomeMap.set(
            String(item._id),
            Math.round((item.totalIncome || 0) * 100) / 100
          );
        });

        expenseTotals.forEach((item) => {
          if (!item?._id) return;
          expenseMap.set(
            String(item._id),
            Math.round((item.totalExpense || 0) * 100) / 100
          );
        });
      }
    }

    const totalOrders = await Order.countDocuments(filter);

    const formattedOrders = orders.map((order) => {
      const platform =
        order.orderPlatform && typeof order.orderPlatform === "object"
          ? { _id: order.orderPlatform._id, name: order.orderPlatform.name }
          : null;
      const orderIdStr = order?._id ? String(order._id) : "";
      const totalIncome = incomeMap.get(orderIdStr) ?? 0;
      const totalExpense = expenseMap.get(orderIdStr) ?? 0;
      const netProfit =
        Math.round((Number(totalIncome) - Number(totalExpense)) * 100) / 100;

      return {
        ...order,
        orderPlatform: platform,
        totalIncome,
        totalExpense,
        netProfit,
      };
    });

    return sendSuccessResponse({
      status: 200,
      res,
      data: {
        orders: formattedOrders,
        totalCount: totalOrders,
        page: pageNum,
        limit: limitNum,
      },
      message: "Orders retrieved successfully.",
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return sendErrorResponse({
      status: 500,
      res,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Update order by ID
const updateOrder = async (req, res, next) => {
  try {
    await sanitizeOrderPlatformValues();

    const { id } = req.params;
    const updateData = req.body;

    // Check if order exists
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    // Validate client existence if clientName is being updated
    if (updateData.clientName) {
      const existingClient = await User.findOne({
        $or: [
          { firstName: new RegExp(updateData.clientName, "i") },
          { lastName: new RegExp(updateData.clientName, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.clientName, options: "i" } } }
        ]
      });

      if (!existingClient) {
        return sendErrorResponse({
          res,
          message: `Client "${updateData.clientName}" does not exist. Please add client first.`,
          status: 400,
        });
      }
    }

    // Validate product existence if product is being updated
    if (updateData.product) {
      const existingProduct = await Product.findOne({
        productName: new RegExp(updateData.product, "i")
      });

      if (!existingProduct) {
        return sendErrorResponse({
          res,
          message: `Product "${updateData.product}" does not exist. Please add product first.`,
          status: 400,
        });
      }
    }

    // Validate supplier existence if supplier is being updated
    if (updateData.supplier && updateData.supplier.trim()) {
      const existingSupplier = await Supplier.findOne({
        $or: [
          { firstName: new RegExp(updateData.supplier, "i") },
          { lastName: new RegExp(updateData.supplier, "i") },
          { company: new RegExp(updateData.supplier, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.supplier, options: "i" } } }
        ]
      });

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier "${updateData.supplier}" does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    if (updateData.orderPlatform !== undefined) {
      try {
        const master = await normalizeMasterIdOrThrow(
          updateData.orderPlatform,
          "orderPlatform"
        );
        updateData.orderPlatform = master._id;
      } catch (error) {
        return sendErrorResponse({
          res,
          message: error.message || "Invalid order platform",
          status: error.status || 400,
        });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, "productImages") ||
      Object.prototype.hasOwnProperty.call(updateData, "productImage")
    ) {
      const normalizedProductImages = extractProductImages(
        updateData.productImages ?? updateData.productImage,
        { fallback: true }
      );
      updateData.productImages = normalizedProductImages;
      delete updateData.productImage;
    }

    // Round amount values if being updated
    if (updateData.purchasePrice !== undefined) {
      updateData.purchasePrice = Math.round((updateData.purchasePrice || 0) * 100) / 100;
    }
    if (updateData.sellingPrice !== undefined) {
      updateData.sellingPrice = Math.round((updateData.sellingPrice || 0) * 100) / 100;
    }
    if (updateData.initialPayment !== undefined) {
      updateData.initialPayment = Math.round((updateData.initialPayment || 0) * 100) / 100;
    }
    if (updateData.paymentAmount !== undefined && updateData.paymentAmount !== null) {
      updateData.paymentAmount = Math.round(updateData.paymentAmount * 100) / 100;
    }
    if (updateData.shippingCost !== undefined && updateData.shippingCost !== null) {
      updateData.shippingCost = Math.round(updateData.shippingCost * 100) / 100;
    }

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .select("-__v")
      .populate({
        path: "orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      });

    sendSuccessResponse({
      res,
      data: updatedOrder,
      message: "Order updated successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Delete order by ID
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if order exists
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    // Hard delete the order
    await Order.findByIdAndDelete(id);

    sendSuccessResponse({
      res,
      data: null,
      message: "Order deleted successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get order by ID
const getOrderById = async (req, res, next) => {
  try {
    await sanitizeOrderPlatformValues();

    const { id } = req.params;

    const order = await Order.findById(id)
      .select("-__v")
      .populate({
        path: "orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      });
    
    if (!order) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    sendSuccessResponse({
      res,
      data: order,
      message: "Order retrieved successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get Kanban Board Data
const getKanbanData = async (req, res) => {
  try {
    const { startDate = "", endDate = "" } = req.query;

    const statuses = Object.values(ORDER_STATUS);
    const kanbanData = {};

    // Date range filter
    let dateFilter = {};
    if (startDate || endDate) {
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

      dateFilter.orderDate = {};

      if (startDate) {
        const start = parseDate(startDate);
        if (start) {
          dateFilter.orderDate.$gte = start;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid startDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }

      if (endDate) {
        const end = parseDate(endDate);
        if (end) {
          end.setHours(23, 59, 59, 999); // End of day
          dateFilter.orderDate.$lte = end;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }
    }

    const promises = statuses.map(async (status) => {
      const queryFilter = { status, ...dateFilter };
      const orders = await Order.find(queryFilter).sort({ createdAt: 'asc' });
      kanbanData[status] = orders;
    });

    await Promise.all(promises);

    return sendSuccessResponse({
      res,
      data: kanbanData,
      message: "Kanban board data retrieved successfully",
      status: 200
    });

  } catch (err) {
    console.error("Error retrieving Kanban board data:", err);
    return sendErrorResponse({
      res,
      message: "Failed to retrieve Kanban board data",
      status: 500
    });
  }
};

// Update Order Checklist
export const updateOrderChecklist = async (req, res) => {
  try {
    const { orderId, checklist } = req.body;
    const id = orderId || req.params?.id;

    if (!id) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!Array.isArray(checklist)) {
      return sendErrorResponse({ res, status: 400, message: "Checklist array is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    order.checklist = checklist;
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Checklist updated successfully",
    });
  } catch (err) {
    console.error("Error updating checklist:", err);
    return sendErrorResponse({ res, status: 500, message: "Failed to update checklist" });
  }
};

// Update Order Status
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const id = orderId || req.params?.id;

    if (!id) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!status) {
      return sendErrorResponse({ res, status: 400, message: "status is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    const protectedColumns = [
      ORDER_STATUS.VIDEO_CONFIRMATION,
      ORDER_STATUS.DISPATCH,
      ORDER_STATUS.UPDATED_TRACKING_ID,
    ];

    if (protectedColumns.includes(status)) {
      const requiredChecks = ["diamonds", "movements", "crown", "datetime", "rah"];
      const incomplete = requiredChecks.filter((key) => {
        const found = order.checklist.find((c) => c.id === key);
        return !found || !found.checked;
      });
      if (incomplete.length > 0) {
        return sendErrorResponse({
          res,
          status: 400,
          message: `Cannot move to ${status}. Incomplete checks: ${incomplete.join(", ")}`,
        });
      }
    }

    // Validate payment is complete before moving to DISPATCH
    if (status === ORDER_STATUS.DISPATCH) {
      const roundedInitialPayment = Math.round((order.initialPayment || 0) * 100) / 100;
      const roundedSellingPrice = Math.round((order.sellingPrice || 0) * 100) / 100;
      if (roundedInitialPayment !== roundedSellingPrice) {
        return sendErrorResponse({
          res,
          status: 400,
          message: `Cannot move to dispatch. Payment incomplete. Initial Payment (${formatCurrency(roundedInitialPayment)}) must match Selling Price (${formatCurrency(roundedSellingPrice)}) before moving to Dispatch!`,
        });
      }
    }

    order.status = status;
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Order status updated successfully",
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update order status",
    });
  }
};

// Update Tracking Info
export const updateTrackingInfo = async (req, res) => {
  try {
    const { orderId, trackingId, courierCompany, shippingCost } = req.body;

    if (!orderId) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!trackingId || !courierCompany) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Both trackingId and courierCompany are required",
      });
    }

    // Check if trackingId already exists in another order
    const existingOrder = await Order.findOne({ trackingId, _id: { $ne: orderId } });
    if (existingOrder) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Tracking ID "${trackingId}" is already assigned to another order.`,
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    order.trackingId = trackingId;
    order.courierCompany = courierCompany;
    order.status = ORDER_STATUS.UPDATED_TRACKING_ID;
    order.trackingIdUpdatedAt = new Date();
    if (shippingCost !== undefined && shippingCost !== null) {
      order.shippingCost = Math.round(shippingCost * 100) / 100;
    }
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Tracking info updated successfully and order moved to Updated Tracking ID column",
    });
  } catch (error) {
    console.error("Error updating tracking info:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update tracking info",
    });
  }
};

// Update Initial Payment
export const updateInitialPayment = async (req, res) => {
  try {
    const { orderId, initialPayment, bankName, paymentAmount } = req.body;

    // --- Basic validations ---
    if (!orderId) {
      return sendErrorResponse({ res, status: 400, message: "_id (orderId) is required" });
    }
    if (initialPayment === undefined || initialPayment === null) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "initialPayment is required",
      });
    }
    if (typeof initialPayment !== "number" || initialPayment < 0) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "initialPayment must be a positive number",
      });
    }

    // --- Validate and find by _id ---
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Invalid MongoDB _id provided",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    // --- Validate against sellingPrice ---
    const roundedSellingPrice = Math.round(Number(order.sellingPrice || 0) * 100) / 100;
    const roundedInitialPayment = Math.round(initialPayment * 100) / 100;
    
    if (roundedInitialPayment > roundedSellingPrice) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Initial Payment (${formatCurrency(roundedInitialPayment)}) cannot exceed Selling Price (${formatCurrency(roundedSellingPrice)})`,
      });
    }

    // --- Update payment ---
    order.initialPayment = roundedInitialPayment;
    
    // Update bank name if provided
    if (bankName) {
      order.bankName = bankName;
    }
    
    // Update payment amount if provided
    if (paymentAmount !== undefined && paymentAmount !== null) {
      order.paymentAmount = Math.round(paymentAmount * 100) / 100;
    }

    // --- Auto update status if fully paid ---
    const isPaymentComplete = roundedInitialPayment === roundedSellingPrice;
    if (isPaymentComplete && order.status !== ORDER_STATUS.DISPATCH) {
      order.status = ORDER_STATUS.DISPATCH;
    }

    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Initial payment updated successfully.",
    });
  } catch (error) {
    console.error("Error updating initial payment:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update initial payment",
    });
  }
};


export default {
  createOrder,
  getAllOrders,
  updateOrder,
  deleteOrder,
  getOrderById,
  updateOrderStatus,
  getKanbanData,
  updateOrderChecklist,
  updateTrackingInfo,
  updateInitialPayment
}
