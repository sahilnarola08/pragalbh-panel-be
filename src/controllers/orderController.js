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
      products,
      bankName,
      paymentAmount,
      supplier,
      otherDetails,
      shippingCost
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

    // Validate products array
    if (!Array.isArray(products) || products.length === 0) {
      return sendErrorResponse({
        res,
        message: "At least one product is required",
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

    // Process and validate each product
    const processedProducts = [];
    for (const product of products) {
      // ✅ Validate product existence
      const existingProduct = await Product.findOne({
        productName: new RegExp(product.productName, "i")
      });

      if (!existingProduct) {
        return sendErrorResponse({
          res,
          message: `Product "${product.productName}" does not exist. Please add product first.`,
          status: 400,
        });
      }

      // Validate and normalize orderPlatform
      let orderPlatformMaster;
      try {
        orderPlatformMaster = await normalizeMasterIdOrThrow(product.orderPlatform, "orderPlatform");
      } catch (error) {
        return sendErrorResponse({
          res,
          message: error.message || "Invalid order platform",
          status: error.status || 400,
        });
      }

      // Validate and normalize mediator if provided
      let mediatorMaster = null;
      if (product.mediator) {
        try {
          mediatorMaster = await normalizeMasterIdOrThrow(product.mediator, "mediator");
        } catch (error) {
          return sendErrorResponse({
            res,
            message: error.message || "Invalid mediator",
            status: error.status || 400,
          });
        }
      }

      const normalizedProductImages = extractProductImages(
        product.productImages,
        { fallback: true }
      );

      processedProducts.push({
        productName: product.productName,
        orderDate: product.orderDate,
        dispatchDate: product.dispatchDate,
        purchasePrice: Math.round((product.purchasePrice || 0) * 100) / 100,
        sellingPrice: Math.round((product.sellingPrice || 0) * 100) / 100,
        initialPayment: Math.round((product.initialPayment || 0) * 100) / 100,
        orderPlatform: orderPlatformMaster._id,
        mediator: mediatorMaster ? mediatorMaster._id : undefined,
        productImages: normalizedProductImages,
      });
    }

    // Create order with products array
    const order = await Order.create({
      clientName,
      address,
      products: processedProducts,
      bankName: bankName || "",
      paymentAmount: paymentAmount !== undefined && paymentAmount !== null ? Math.round(paymentAmount * 100) / 100 : paymentAmount,
      supplier: supplier || "",
      otherDetails: otherDetails || "",
      shippingCost: shippingCost !== undefined && shippingCost !== null ? Math.round(shippingCost * 100) / 100 : 0,
      trackingId: "",
      courierCompany: "",
      status: DEFAULT_ORDER_STATUS,
    });

    // Create Income and ExpanseIncome records for each product
    const incomePromises = [];
    const expensePromises = [];

    for (const product of processedProducts) {
      // Create Income record for each product
      incomePromises.push(
        Income.create({
          date: new Date(),
          orderId: order._id,
          Description: product.productName,
          sellingPrice: product.sellingPrice,
          receivedAmount: 0,
          clientId: existingClient._id,
          status: DEFAULT_PAYMENT_STATUS,
        })
      );

      // Create ExpenseIncome record for each product if supplier exists
      if (existingSupplier) {
        expensePromises.push(
          ExpanseIncome.create({
            orderId: order._id,
            description: product.productName,
            paidAmount: 0,
            dueAmount: product.purchasePrice,
            supplierId: existingSupplier._id,
            status: DEFAULT_PAYMENT_STATUS,
          })
        );
      }
    }

    await Promise.all([...incomePromises, ...expensePromises]);

    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: "products.orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "products.mediator",
        select: "_id name",
        match: { isDeleted: false },
      });

    const formattedOrder = populatedOrder.toObject();

    return sendSuccessResponse({
      res,
      data: formattedOrder,
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
        { "products.productName": searchRegex },
        { supplier: searchRegex },
      ];

      if (mongoose.Types.ObjectId.isValid(trimmedSearch)) {
        orConditions.push({ "products.orderPlatform": trimmedSearch });
      }

      if (matchingPlatformIds.length > 0) {
        orConditions.push({
          "products.orderPlatform": { $in: matchingPlatformIds.map((item) => item._id) },
        });
      }

      filter.$or = orConditions;
    }

    // Add status filter if provided in the query
    if (status) {
      filter.status = status;
    }

    // Date range filter - filter by products.orderDate
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

      const dateConditions = {};
      if (startDate) {
        const start = parseDate(startDate);
        if (start) {
          dateConditions.$gte = start;
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
          dateConditions.$lte = end;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }

      if (Object.keys(dateConditions).length > 0) {
        filter["products.orderDate"] = dateConditions;
      }
    }

    const orders = await Order.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limitNum)
      .populate({
        path: "products.orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "products.mediator",
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
      // Format products with populated orderPlatform and mediator
      const formattedProducts = (order.products || []).map((product) => {
        const platform =
          product.orderPlatform && typeof product.orderPlatform === "object"
            ? { _id: product.orderPlatform._id, name: product.orderPlatform.name }
            : null;
        
        const mediatorInfo =
          product.mediator && typeof product.mediator === "object"
            ? { _id: product.mediator._id, name: product.mediator.name }
            : null;

        return {
          ...product,
          orderPlatform: platform,
          mediator: mediatorInfo,
        };
      });

      const orderIdStr = order?._id ? String(order._id) : "";
      const totalIncome = incomeMap.get(orderIdStr) ?? 0;
      const totalExpense = expenseMap.get(orderIdStr) ?? 0;
      const netProfit =
        Math.round((Number(totalIncome) - Number(totalExpense)) * 100) / 100;

      return {
        ...order,
        products: formattedProducts,
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

    // Process products array if being updated
    if (updateData.products && Array.isArray(updateData.products)) {
      const processedProducts = [];
      
      for (const product of updateData.products) {
        // Validate product existence
        const existingProduct = await Product.findOne({
          productName: new RegExp(product.productName, "i")
        });

        if (!existingProduct) {
          return sendErrorResponse({
            res,
            message: `Product "${product.productName}" does not exist. Please add product first.`,
            status: 400,
          });
        }

        // Validate and normalize orderPlatform
        let orderPlatformMaster;
        try {
          orderPlatformMaster = await normalizeMasterIdOrThrow(
            product.orderPlatform,
            "orderPlatform"
          );
        } catch (error) {
          return sendErrorResponse({
            res,
            message: error.message || "Invalid order platform",
            status: error.status || 400,
          });
        }

        // Handle mediator update
        let mediatorMaster = null;
        if (product.mediator !== undefined && product.mediator !== null && product.mediator !== "") {
          try {
            mediatorMaster = await normalizeMasterIdOrThrow(
              product.mediator,
              "mediator"
            );
          } catch (error) {
            return sendErrorResponse({
              res,
              message: error.message || "Invalid mediator",
              status: error.status || 400,
            });
          }
        }

        const normalizedProductImages = extractProductImages(
          product.productImages,
          { fallback: true }
        );

        processedProducts.push({
          productName: product.productName,
          orderDate: product.orderDate,
          dispatchDate: product.dispatchDate,
          purchasePrice: Math.round((product.purchasePrice || 0) * 100) / 100,
          sellingPrice: Math.round((product.sellingPrice || 0) * 100) / 100,
          initialPayment: Math.round((product.initialPayment || 0) * 100) / 100,
          orderPlatform: orderPlatformMaster._id,
          mediator: mediatorMaster ? mediatorMaster._id : undefined,
          productImages: normalizedProductImages,
        });
      }

      updateData.products = processedProducts;
    }

    // Round amount values if being updated
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
        path: "products.orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "products.mediator",
        select: "_id name",
        match: { isDeleted: false },
      });

    const formattedOrder = updatedOrder.toObject();

    sendSuccessResponse({
      res,
      data: formattedOrder,
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

    const { id } = req.params;

    const order = await Order.findById(id)
      .select("-__v")
      .populate({
        path: "products.orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "products.mediator",
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

    const formattedOrder = order.toObject();

    sendSuccessResponse({
      res,
      data: formattedOrder,
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

      const dateConditions = {};

      if (startDate) {
        const start = parseDate(startDate);
        if (start) {
          dateConditions.$gte = start;
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
          dateConditions.$lte = end;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }

      if (Object.keys(dateConditions).length > 0) {
        dateFilter["products.orderDate"] = dateConditions;
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
      if (!order.products || !Array.isArray(order.products) || order.products.length === 0) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Order has no products",
        });
      }

      // Check if all products are fully paid
      const unpaidProducts = order.products.filter(p => {
        const productInitialPayment = Math.round((p.initialPayment || 0) * 100) / 100;
        const productSellingPrice = Math.round((p.sellingPrice || 0) * 100) / 100;
        return productInitialPayment !== productSellingPrice;
      });

      if (unpaidProducts.length > 0) {
        const unpaidProductNames = unpaidProducts.map(p => p.productName).join(", ");
        return sendErrorResponse({
          res,
          status: 400,
          message: `Cannot move to dispatch. Payment incomplete for products: ${unpaidProductNames}. All products must be fully paid before moving to Dispatch!`,
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
    const { orderId, productIndex, initialPayment, bankName, paymentAmount } = req.body;

    // --- Basic validations ---
    if (!orderId) {
      return sendErrorResponse({ res, status: 400, message: "_id (orderId) is required" });
    }
    if (productIndex === undefined || productIndex === null) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "productIndex is required to specify which product to update",
      });
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

    if (!order.products || !Array.isArray(order.products) || order.products.length === 0) {
      return sendErrorResponse({ res, status: 400, message: "Order has no products" });
    }

    if (productIndex < 0 || productIndex >= order.products.length) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Invalid productIndex. Must be between 0 and ${order.products.length - 1}`,
      });
    }

    const product = order.products[productIndex];

    // --- Validate against sellingPrice ---
    const roundedSellingPrice = Math.round(Number(product.sellingPrice || 0) * 100) / 100;
    const roundedInitialPayment = Math.round(initialPayment * 100) / 100;
    
    if (roundedInitialPayment > roundedSellingPrice) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Initial Payment (${formatCurrency(roundedInitialPayment)}) cannot exceed Selling Price (${formatCurrency(roundedSellingPrice)})`,
      });
    }

    // --- Update payment for the specific product ---
    product.initialPayment = roundedInitialPayment;
    
    // Update bank name if provided (order level)
    if (bankName) {
      order.bankName = bankName;
    }
    
    // Update payment amount if provided (order level)
    if (paymentAmount !== undefined && paymentAmount !== null) {
      order.paymentAmount = Math.round(paymentAmount * 100) / 100;
    }

    // --- Auto update status if all products are fully paid ---
    const allProductsPaid = order.products.every(p => {
      const productInitialPayment = Math.round((p.initialPayment || 0) * 100) / 100;
      const productSellingPrice = Math.round((p.sellingPrice || 0) * 100) / 100;
      return productInitialPayment === productSellingPrice;
    });

    if (allProductsPaid && order.status !== ORDER_STATUS.DISPATCH) {
      order.status = ORDER_STATUS.DISPATCH;
    }

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: "products.orderPlatform",
        select: "_id name",
        match: { isDeleted: false },
      })
      .populate({
        path: "products.mediator",
        select: "_id name",
        match: { isDeleted: false },
      });

    return sendSuccessResponse({
      res,
      status: 200,
      data: populatedOrder,
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
