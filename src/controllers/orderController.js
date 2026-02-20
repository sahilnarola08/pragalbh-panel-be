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
import Mediator from "../models/mediator.js";
import Payment from "../models/payment.js";
import { DEFAULT_PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";
import { formatCurrency } from "../util/currencyFormat.js";
import orderProfitService from "../services/orderProfitService.js";

const DEFAULT_ORDER_IMAGE_PLACEHOLDER =
  "https://placehold.co/100x100/A0B2C7/FFFFFF?text=Product";

// extract product images
const extractProductImages = (input, { fallback } = { fallback: false }) => {
  if (input === undefined || input === null) {
    return fallback ? [{ img: DEFAULT_ORDER_IMAGE_PLACEHOLDER }] : [];
  }

  // If input is an empty array, return empty array (no default image)
  if (Array.isArray(input) && input.length === 0) {
    return [];
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

  // Return empty array instead of undefined or fallback when no images provided
  return [];
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
      shippingCost,
      newClient,
    } = req.body;

    let existingClient = await User.findOne({
      $or: [
        { firstName: { $regex: (clientName || "").trim(), $options: "i" } },
        { lastName: { $regex: (clientName || "").trim(), $options: "i" } },
        { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: (clientName || "").trim(), options: "i" } } }
      ],
      isDeleted: false
    }).lean();

    if (!existingClient && newClient && typeof newClient === "object") {
      const { firstName, lastName, address: newAddress, contactNumber, email } = newClient;
      if (!firstName || !lastName) {
        return sendErrorResponse({
          res,
          message: "New client requires firstName and lastName.",
          status: 400,
        });
      }
      const uniqueSuffix = String(new mongoose.Types.ObjectId()).slice(-8);
      const created = await User.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        address: (newAddress || address || "").trim(),
        contactNumber: (contactNumber && String(contactNumber).trim()) || `ord_${uniqueSuffix}`,
        email: (email && String(email).trim()) || `client_${uniqueSuffix}@order.local`,
      });
      existingClient = created.toObject();
    }

    if (!existingClient) {
      return sendErrorResponse({
        res,
        message: `Client "${(clientName || "").trim()}" not found. Select an existing client or add new client details.`,
        status: 400,
      });
    }

    const resolvedClientName = existingClient.firstName && existingClient.lastName
      ? `${existingClient.firstName} ${existingClient.lastName}`.trim()
      : (clientName || "").trim();
    const resolvedAddress = (address || existingClient.address || "").trim();

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
          { firstName: { $regex: supplierName, $options: "i" } },
          { lastName: { $regex: supplierName, $options: "i" } },
          { company: { $regex: supplierName, $options: "i" } },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: supplierName, options: "i" } } }
        ],
        isDeleted: false
      }).lean();

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier ${supplierName} does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    // ✅ BATCH VALIDATION - Process all products in parallel instead of sequential
    const productNames = products.map(p => p.productName.trim());
    const orderPlatformIds = products.map(p => p.orderPlatform).filter(Boolean);
    const mediatorIds = products.map(p => p.mediator).filter(Boolean);
    const mediatorsArrayIds = (products.map(p => p.mediators).filter(Boolean).flat()).filter(id => mongoose.Types.ObjectId.isValid(id));
    const masterIds = [...new Set([...orderPlatformIds, ...mediatorIds].filter(Boolean))];
    const uniqueMediatorIds = [...new Set(mediatorsArrayIds)];

    const [existingProducts, existingMasters, existingMediatorsList] = await Promise.all([
      Product.find({
        productName: { $in: productNames },
        isDeleted: false
      }).select("productName").lean(),
      masterIds.length > 0 ? Master.find({
        _id: { $in: masterIds },
        isDeleted: false
      }).select("_id name").lean() : [],
      uniqueMediatorIds.length > 0 ? Mediator.find({ _id: { $in: uniqueMediatorIds } }).select("_id name").lean() : []
    ]);

    const productMap = new Map(existingProducts.map(p => [p.productName.toLowerCase(), p]));
    const masterMap = new Map(existingMasters.map(m => [String(m._id), m]));
    const mediatorMap = new Map(existingMediatorsList.map(m => [String(m._id), m]));

    const processedProducts = [];
    for (const product of products) {
      const productKey = product.productName.trim().toLowerCase();
      const existingProduct = productMap.get(productKey);

      if (!existingProduct) {
        return sendErrorResponse({
          res,
          message: `Product ${product.productName} does not exist. Please add product first.`,
          status: 400,
        });
      }

      const orderPlatformId = typeof product.orderPlatform === 'object'
        ? product.orderPlatform._id || product.orderPlatform.id || String(product.orderPlatform)
        : String(product.orderPlatform);
      const orderPlatformMaster = masterMap.get(orderPlatformId);
      if (!orderPlatformMaster) {
        return sendErrorResponse({
          res,
          message: "Invalid order platform",
          status: 400,
        });
      }

      let mediatorMaster = null;
      let mediatorsList = [];
      if (product.mediators && Array.isArray(product.mediators) && product.mediators.length > 0) {
        for (const mid of product.mediators) {
          const id = typeof mid === 'object' ? (mid._id || mid.id || String(mid)) : String(mid);
          const med = mediatorMap.get(id);
          if (!med) {
            return sendErrorResponse({
              res,
              message: "Invalid mediator (from Mediators list). Please select from Mediators.",
              status: 400,
            });
          }
          mediatorsList.push(med._id);
        }
      } else if (product.mediator) {
        const mediatorId = typeof product.mediator === 'object'
          ? product.mediator._id || product.mediator.id || String(product.mediator)
          : String(product.mediator);
        mediatorMaster = masterMap.get(mediatorId);
        if (!mediatorMaster) {
          return sendErrorResponse({
            res,
            message: "Invalid mediator",
            status: 400,
          });
        }
      }

      const normalizedProductImages = extractProductImages(
        product.productImages,
        { fallback: false }
      );

      const paymentCurrency = product.paymentCurrency === 'USD' ? 'USD' : 'INR';

      processedProducts.push({
        productName: product.productName,
        orderDate: product.orderDate,
        dispatchDate: product.dispatchDate,
        purchasePrice: Math.round((product.purchasePrice || 0) * 100) / 100,
        sellingPrice: Math.round((product.sellingPrice || 0) * 100) / 100,
        initialPayment: Math.round((product.initialPayment || 0) * 100) / 100,
        orderPlatform: orderPlatformMaster._id,
        mediator: mediatorMaster ? mediatorMaster._id : undefined,
        mediators: mediatorsList.length ? mediatorsList : undefined,
        paymentCurrency,
        productImages: normalizedProductImages,
      });
    }

    // Create order with products array
    const order = await Order.create({
      clientName: resolvedClientName,
      address: resolvedAddress,
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
          initialPayment: product.initialPayment,
          receivedAmount: 0,
          clientId: existingClient._id,
          status: DEFAULT_PAYMENT_STATUS,
        })
      );

      // Create ExpenseIncome record for each product if supplier exists
      if (existingSupplier) {
        expensePromises.push(
          ExpanseIncome.create({
            date: new Date(),
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

    // Create Payment (lifecycle) entries so they show in Payment Lifecycle list
    let usdToInrRate = null;
    try {
      const rateRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
      const rateData = await rateRes.json();
      if (rateData?.rates?.INR != null) usdToInrRate = Number(rateData.rates.INR);
    } catch (e) {
      // ignore; payments can be updated with rate later
    }

    const paymentPromises = [];
    for (const product of processedProducts) {
      const initialPayment = Math.round((product.initialPayment || 0) * 100) / 100;
      if (initialPayment <= 0) continue;
      // Payment.mediatorId refs Mediator collection; use only product.mediators (not legacy Master mediator)
      const mediatorId = product.mediators?.[0];
      if (!mediatorId) continue;

      const isUSD = product.paymentCurrency === "USD";
      const conversionRate = isUSD ? (usdToInrRate || 0) : 1;
      paymentPromises.push(
        Payment.create({
          orderId: order._id,
          grossAmountUSD: initialPayment,
          mediatorId,
          conversionRate,
          paymentStatus: DEFAULT_PAYMENT_LIFECYCLE_STATUS,
        })
      );
    }
    if (paymentPromises.length) await Promise.all(paymentPromises);

    // ✅ Invalidate cache after order creation
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order');
    invalidateCache('dashboard');

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
      })
      .populate({
        path: "products.mediators",
        select: "_id name",
      })
      .lean();

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

    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "createdAt",
      sortOrder = "desc",
      status = "",
      startDate = "",
      endDate = "",
      includeDeleted = ""
    } = req.query;

    // Parse page and limit to integers with proper defaults and validation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    // Sorting
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Search filter
    const filter = {};
    const trimmedSearch = (search || "").trim();
    let matchingPlatformIds = [];

    if (trimmedSearch) {
      const escapedForRegex = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchingPlatformIds = await Master.find({
        name: new RegExp(escapedForRegex, "i"),
        isDeleted: false,
      }).select("_id");

      const searchRegex = new RegExp(escapedForRegex, "i");
      const orConditions = [
        { orderId: searchRegex },
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

    // Exclude soft-deleted orders unless includeDeleted is true (for Order History)
    const showDeleted = includeDeleted === "true" || includeDeleted === true;
    if (!showDeleted) {
      filter.isDeleted = false;
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

    // Net profit and payment status per order (same calculation as Payment & Profit Summary)
    let profitSummaryMap = new Map();
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o?._id).filter(Boolean);
      profitSummaryMap = await orderProfitService.getOrderProfitSummaryBulk(orderIds);
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
      const summary = profitSummaryMap.get(orderIdStr) || { netProfit: 0, totalActualINR: 0, totalExpenses: 0, totalExpectedINR: 0, estimatedProfit: 0, paymentStatus: "Unpaid" };

      return {
        ...order,
        products: formattedProducts,
        netProfit: summary.netProfit,
        paymentStatus: summary.paymentStatus,
        totalActualINR: summary.totalActualINR,
        totalExpenses: summary.totalExpenses,
        totalExpectedINR: summary.totalExpectedINR,
        estimatedProfit: summary.estimatedProfit,
      };
    });

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

// Update order by ID (id may be MongoDB _id or orderId string e.g. PJ022615)
const updateOrder = async (req, res, next) => {
  try {

    const { id } = req.params;
    const updateData = req.body;

    const resolved = await resolveOrderById(id);
    if (!resolved) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }
    const orderMongoId = resolved._id;

    // Check if order exists and is not deleted
    const existingOrder = await Order.findById(orderMongoId);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }
    if (existingOrder.isDeleted) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "Cannot update a deleted order. View it in Order History."
      });
    }

    let existingClient = null;
    let existingSupplier = null;

    // Validate client existence if clientName is being updated
    if (updateData.clientName) {
      existingClient = await User.findOne({
        $or: [
          { firstName: { $regex: updateData.clientName.trim(), $options: "i" } },
          { lastName: { $regex: updateData.clientName.trim(), $options: "i" } },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.clientName.trim(), options: "i" } } }
        ],
        isDeleted: false
      }).lean();

      if (!existingClient) {
        return sendErrorResponse({
          res,
          message: `Client "${updateData.clientName}" does not exist. Please add client first.`,
          status: 400,
        });
      }
    }

    // ✅ Validate supplier existence if supplier is being updated - optimized
    if (updateData.supplier && updateData.supplier.trim()) {
      existingSupplier = await Supplier.findOne({
        $or: [
          { firstName: { $regex: updateData.supplier.trim(), $options: "i" } },
          { lastName: { $regex: updateData.supplier.trim(), $options: "i" } },
          { company: { $regex: updateData.supplier.trim(), $options: "i" } },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.supplier.trim(), options: "i" } } }
        ],
        isDeleted: false
      }).lean();

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier "${updateData.supplier}" does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    if (updateData.products && Array.isArray(updateData.products)) {
      const productNames = updateData.products.map(p => p.productName?.trim()).filter(Boolean);
      const orderPlatformIds = updateData.products.map(p => p.orderPlatform).filter(Boolean);
      const mediatorIds = updateData.products.map(p => p.mediator).filter(Boolean);
      const mediatorsArrayIds = (updateData.products.map(p => p.mediators).filter(Boolean).flat()).filter(id => mongoose.Types.ObjectId.isValid(id));
      const masterIds = [...new Set([...orderPlatformIds, ...mediatorIds].filter(Boolean))];
      const uniqueMediatorIds = [...new Set(mediatorsArrayIds)];

      const [existingProducts, existingMasters, existingMediatorsList] = await Promise.all([
        Product.find({
          productName: { $in: productNames },
          isDeleted: false
        }).select("productName").lean(),
        masterIds.length > 0 ? Master.find({
          _id: { $in: masterIds },
          isDeleted: false
        }).select("_id name").lean() : [],
        uniqueMediatorIds.length > 0 ? Mediator.find({ _id: { $in: uniqueMediatorIds } }).select("_id name").lean() : []
      ]);

      const productMap = new Map(existingProducts.map(p => [p.productName.toLowerCase(), p]));
      const masterMap = new Map(existingMasters.map(m => [String(m._id), m]));
      const mediatorMap = new Map(existingMediatorsList.map(m => [String(m._id), m]));
      const processedProducts = [];

      for (const product of updateData.products) {
        const productKey = product.productName?.trim().toLowerCase();
        const existingProduct = productMap.get(productKey);

        if (!existingProduct) {
          return sendErrorResponse({
            res,
            message: `Product "${product.productName}" does not exist. Please add product first.`,
            status: 400,
          });
        }

        const orderPlatformId = typeof product.orderPlatform === 'object'
          ? product.orderPlatform._id || product.orderPlatform.id || String(product.orderPlatform)
          : String(product.orderPlatform);
        const orderPlatformMaster = masterMap.get(orderPlatformId);
        if (!orderPlatformMaster) {
          return sendErrorResponse({
            res,
            message: "Invalid order platform",
            status: 400,
          });
        }

        let mediatorMaster = null;
        let mediatorsList = [];
        if (product.mediators && Array.isArray(product.mediators) && product.mediators.length > 0) {
          for (const mid of product.mediators) {
            const id = typeof mid === 'object' ? (mid._id || mid.id || String(mid)) : String(mid);
            const med = mediatorMap.get(id);
            if (!med) {
              return sendErrorResponse({
                res,
                message: "Invalid mediator (from Mediators list).",
                status: 400,
              });
            }
            mediatorsList.push(med._id);
          }
        } else if (product.mediator !== undefined && product.mediator !== null && product.mediator !== "") {
          const mediatorId = typeof product.mediator === 'object'
            ? product.mediator._id || product.mediator.id || String(product.mediator)
            : String(product.mediator);
          mediatorMaster = masterMap.get(mediatorId);
          if (!mediatorMaster) {
            return sendErrorResponse({
              res,
              message: "Invalid mediator",
              status: 400,
            });
          }
        }

        const normalizedProductImages = extractProductImages(
          product.productImages,
          { fallback: false }
        );
        const paymentCurrency = product.paymentCurrency === 'USD' ? 'USD' : 'INR';

        processedProducts.push({
          productName: product.productName,
          orderDate: product.orderDate,
          dispatchDate: product.dispatchDate,
          purchasePrice: Math.round((product.purchasePrice || 0) * 100) / 100,
          sellingPrice: Math.round((product.sellingPrice || 0) * 100) / 100,
          initialPayment: Math.round((product.initialPayment || 0) * 100) / 100,
          orderPlatform: orderPlatformMaster._id,
          mediator: mediatorMaster ? mediatorMaster._id : undefined,
          mediators: mediatorsList.length ? mediatorsList : undefined,
          paymentCurrency,
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
    if (updateData.supplierCost !== undefined && updateData.supplierCost !== null) {
      updateData.supplierCost = Math.round(updateData.supplierCost * 100) / 100;
    }
    if (updateData.packagingCost !== undefined && updateData.packagingCost !== null) {
      updateData.packagingCost = Math.round(updateData.packagingCost * 100) / 100;
    }
    if (updateData.otherExpenses !== undefined && updateData.otherExpenses !== null) {
      updateData.otherExpenses = Math.round(updateData.otherExpenses * 100) / 100;
    }

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(
      orderMongoId,
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
      })
      .lean();

    // ✅ Invalidate cache after order update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', id);
    invalidateCache('dashboard');

    // --- Sync related Income and Expense records for this order ---
    try {
      // Get client and supplier IDs (use existing if not updated)
      let clientId = existingClient?._id;
      let supplierId = existingSupplier?._id;

      // If client wasn't updated, get it from existing order
      if (!clientId && existingOrder.clientName) {
        const clientFromOrder = await User.findOne({
          $or: [
            { firstName: { $regex: existingOrder.clientName.trim(), $options: "i" } },
            { lastName: { $regex: existingOrder.clientName.trim(), $options: "i" } },
            { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: existingOrder.clientName.trim(), options: "i" } } }
          ],
          isDeleted: false
        }).select("_id").lean();
        clientId = clientFromOrder?._id;
      }

      // If supplier wasn't updated, get it from existing order
      if (!supplierId && existingOrder.supplier) {
        const supplierFromOrder = await Supplier.findOne({
          $or: [
            { firstName: { $regex: existingOrder.supplier.trim(), $options: "i" } },
            { lastName: { $regex: existingOrder.supplier.trim(), $options: "i" } },
            { company: { $regex: existingOrder.supplier.trim(), $options: "i" } },
            { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: existingOrder.supplier.trim(), options: "i" } } }
          ],
          isDeleted: false
        }).select("_id").lean();
        supplierId = supplierFromOrder?._id;
      }

      const [orderIncomes, orderExpenses] = await Promise.all([
        Income.find({ orderId: id, isDeleted: { $ne: true } }).sort({ createdAt: 1, _id: 1 }),
        ExpanseIncome.find({ orderId: id, isDeleted: { $ne: true } }).sort({ createdAt: 1, _id: 1 }),
      ]);

      // Update client reference in Income if client changed
      if (existingClient && orderIncomes.length > 0) {
        orderIncomes.forEach((inc) => {
          inc.clientId = existingClient._id;
        });
      }

      // Update supplier reference in Expense if supplier changed
      if (existingSupplier && orderExpenses.length > 0) {
        orderExpenses.forEach((exp) => {
          exp.supplierId = existingSupplier._id;
        });
      }

      const products = Array.isArray(updatedOrder.products)
        ? updatedOrder.products
        : [];

      // ✅ Remove Income and ExpanseIncome records for removed products (do this first)
      if (products.length < orderIncomes.length) {
        const excessIncomes = orderIncomes.slice(products.length);
        const incomeIdsToDelete = excessIncomes.map((inc) => inc._id);
        await Income.deleteMany({ _id: { $in: incomeIdsToDelete } });
        // Remove from array to avoid saving deleted records
        orderIncomes.splice(products.length);
      }

      if (products.length < orderExpenses.length) {
        const excessExpenses = orderExpenses.slice(products.length);
        const expenseIdsToDelete = excessExpenses.map((exp) => exp._id);
        await ExpanseIncome.deleteMany({ _id: { $in: expenseIdsToDelete } });
        // Remove from array to avoid saving deleted records
        orderExpenses.splice(products.length);
      }

      // Only try to sync per-product details when counts match to avoid corrupting extra manual entries
      // (Sync after deletion so remaining records match product count)
      if (products.length > 0 && products.length === orderIncomes.length) {
        products.forEach((product, index) => {
          const income = orderIncomes[index];
          if (!income) return;
          income.Description = product.productName;
          income.sellingPrice = product.sellingPrice;
          income.initialPayment = product.initialPayment;
        });
      }

      if (products.length > 0 && products.length === orderExpenses.length) {
        products.forEach((product, index) => {
          const expense = orderExpenses[index];
          if (!expense) return;
          expense.description = product.productName;
          expense.dueAmount = product.purchasePrice;
        });
      }

      // ✅ Create Income and ExpanseIncome records for newly added products
      if (products.length > orderIncomes.length) {
        const newProducts = products.slice(orderIncomes.length);
        const newIncomePromises = newProducts.map((product) =>
          Income.create({
            date: new Date(),
            orderId: id,
            Description: product.productName,
            sellingPrice: product.sellingPrice,
            initialPayment: product.initialPayment,
            receivedAmount: 0,
            clientId: clientId || existingClient?._id,
            status: DEFAULT_PAYMENT_STATUS,
          })
        );
        await Promise.all(newIncomePromises);
      }

      if (products.length > orderExpenses.length && (supplierId || existingSupplier?._id)) {
        const newProducts = products.slice(orderExpenses.length);
        const newExpensePromises = newProducts.map((product) =>
          ExpanseIncome.create({
            date: new Date(),
            orderId: id,
            description: product.productName,
            paidAmount: 0,
            dueAmount: product.purchasePrice,
            supplierId: supplierId || existingSupplier._id,
            status: DEFAULT_PAYMENT_STATUS,
          })
        );
        await Promise.all(newExpensePromises);
      }

      await Promise.all([
        ...orderIncomes.map((doc) => doc.save()),
        ...orderExpenses.map((doc) => doc.save()),
      ]);
    } catch (syncError) {
      // Log but don't break main order update flow
      console.error("Error syncing income/expense with updated order:", syncError);
    }

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

// Resolve order by id (MongoDB _id or orderId string)
const resolveOrderById = async (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id)) {
    const byMongo = await Order.findById(id).lean();
    if (byMongo) return byMongo;
  }
  return Order.findOne({ orderId: String(id).trim() }).lean();
};

// Soft-delete order and all related entries (Payment, ExpanseIncome, Income)
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existingOrder = await resolveOrderById(id);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }
    const orderMongoId = existingOrder._id;
    if (existingOrder.isDeleted) {
      return sendSuccessResponse({
        res,
        data: null,
        message: "Order is already deleted.",
        status: 200
      });
    }

    // Always reverse supplier advance for this order's paid expenses so supplier list reflects deleted order
    const PAYMENT_STATUS = (await import("../helper/enums.js")).PAYMENT_STATUS;
    const orderExpenses = await ExpanseIncome.find({
      orderId: orderMongoId,
      isDeleted: { $ne: true },
      status: PAYMENT_STATUS.PAID,
      paidAmount: { $gt: 0 },
      supplierId: { $exists: true, $ne: null }
    }).lean();
    for (const exp of orderExpenses) {
      if (!exp.supplierId) continue;
      const supplier = await Supplier.findById(exp.supplierId);
      if (!supplier || !Array.isArray(supplier.advancePayment)) continue;
      const amount = Math.round((exp.paidAmount || 0) * 100) / 100;
      const bankId = exp.bankId || (supplier.advancePayment[0] && supplier.advancePayment[0].bankId);
      if (!bankId) continue;
      const idx = supplier.advancePayment.findIndex((p) => p.bankId && String(p.bankId) === String(bankId));
      if (idx >= 0) {
        supplier.advancePayment[idx].amount = Math.round((Number(supplier.advancePayment[idx].amount) + amount) * 100) / 100;
      } else {
        supplier.advancePayment.push({ bankId, amount });
      }
      await supplier.save();
    }

    const now = new Date();
    await Promise.all([
      Income.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
      ExpanseIncome.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
      Payment.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
      Order.findByIdAndUpdate(orderMongoId, { $set: { isDeleted: true, deletedAt: now } })
    ]);

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', String(orderMongoId));
    invalidateCache('dashboard');

    sendSuccessResponse({
      res,
      data: null,
      message: "Order and all related entries (payments, income, expenses, supplier payments) have been deleted.",
      status: 200
    });
  } catch (error) {
    next(error);
  }
};

// Bulk soft-delete orders and their related entries
const bulkDeleteOrders = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Request body must contain an array of order ids (ids).",
      });
    }

    const deleted = [];
    const skipped = [];
    const PAYMENT_STATUS = (await import("../helper/enums.js")).PAYMENT_STATUS;
    const now = new Date();

    for (const id of ids) {
      const existingOrder = await resolveOrderById(id);
      if (!existingOrder) {
        skipped.push({ id, reason: "not_found" });
        continue;
      }
      if (existingOrder.isDeleted) {
        skipped.push({ id: String(existingOrder._id), reason: "already_deleted" });
        continue;
      }
      const orderMongoId = existingOrder._id;

      // Reverse supplier advance for this order's paid expenses
      const orderExpenses = await ExpanseIncome.find({
        orderId: orderMongoId,
        isDeleted: { $ne: true },
        status: PAYMENT_STATUS.PAID,
        paidAmount: { $gt: 0 },
        supplierId: { $exists: true, $ne: null },
      }).lean();
      for (const exp of orderExpenses) {
        if (!exp.supplierId) continue;
        const supplier = await Supplier.findById(exp.supplierId);
        if (!supplier || !Array.isArray(supplier.advancePayment)) continue;
        const amount = Math.round((exp.paidAmount || 0) * 100) / 100;
        const bankId = exp.bankId || (supplier.advancePayment[0] && supplier.advancePayment[0].bankId);
        if (!bankId) continue;
        const idx = supplier.advancePayment.findIndex((p) => p.bankId && String(p.bankId) === String(bankId));
        if (idx >= 0) {
          supplier.advancePayment[idx].amount = Math.round((Number(supplier.advancePayment[idx].amount) + amount) * 100) / 100;
        } else {
          supplier.advancePayment.push({ bankId, amount });
        }
        await supplier.save();
      }

      await Promise.all([
        Income.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
        ExpanseIncome.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
        Payment.updateMany({ orderId: orderMongoId }, { $set: { isDeleted: true, deletedAt: now } }),
        Order.findByIdAndUpdate(orderMongoId, { $set: { isDeleted: true, deletedAt: now } }),
      ]);
      deleted.push(String(orderMongoId));
    }

    const { invalidateCache } = await import("../util/cacheHelper.js");
    deleted.forEach((orderId) => invalidateCache("order", orderId));
    invalidateCache("dashboard");

    sendSuccessResponse({
      res,
      data: {
        deletedCount: deleted.length,
        skippedCount: skipped.length,
        deletedIds: deleted,
        skipped,
      },
      message:
        deleted.length === 0
          ? "No orders were deleted."
          : `${deleted.length} order(s) and their related entries have been deleted.${skipped.length > 0 ? ` ${skipped.length} skipped.` : ""}`,
      status: 200,
    });
  } catch (error) {
    next(error);
  }
};

// Get order by ID (supports MongoDB _id or orderId string; returns deleted orders for history view)
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const resolved = await resolveOrderById(id);
    if (!resolved) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }
    const order = await Order.findById(resolved._id)
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
      })
      .lean();
    
    if (!order) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    const profitSummary = await orderProfitService.getOrderProfitSummary(String(resolved._id));

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    sendSuccessResponse({
      res,
      data: { ...order, profitSummary: profitSummary || undefined },
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

    // ✅ Optimized Kanban query with lean() and selective fields
    const promises = statuses.map(async (status) => {
      const queryFilter = { status, ...dateFilter };
      const orders = await Order.find(queryFilter)
        .select("_id clientName address products status trackingId courierCompany createdAt checklist shippingCost")
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
        .sort({ createdAt: 'asc' })
        .lean();
      kanbanData[status] = orders;
    });

    await Promise.all(promises);

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

    // ✅ Invalidate cache after checklist update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', id);

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

    // ✅ Invalidate cache after status update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', id);
    invalidateCache('dashboard');
    invalidateCache('kanban');

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

    // ✅ Invalidate cache after tracking update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', orderId);
    invalidateCache('dashboard');
    invalidateCache('kanban');

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
      })
      .lean();

    // ✅ Invalidate cache after payment update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('order', orderId);
    invalidateCache('dashboard');

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
  bulkDeleteOrders,
  getOrderById,
  updateOrderStatus,
  getKanbanData,
  updateOrderChecklist,
  updateTrackingInfo,
  updateInitialPayment
}
