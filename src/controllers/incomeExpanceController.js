import ExpanceIncome from "../models/expance_inc.js";
import Master from "../models/master.js";
import Payment from "../models/payment.js";
import ManualBankEntry from "../models/manualBankEntry.js";
import mongoose from "mongoose";
import { PAYMENT_LIFECYCLE_STATUS } from "../helper/enums.js";

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

const roundAmount = (value) =>
  Math.round((Number(value) || 0) * 100) / 100;

/** Cached USD→INR rate (5 min TTL) for income display */
let usdToInrCache = { rate: null, ts: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

const getUsdToInrRate = async () => {
  if (usdToInrCache.rate != null && Date.now() - usdToInrCache.ts < CACHE_TTL_MS) {
    return usdToInrCache.rate;
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    const data = await res.json();
    const rate = data?.rates?.INR != null ? Number(data.rates.INR) : null;
    if (rate != null && !isNaN(rate)) {
      usdToInrCache = { rate, ts: Date.now() };
      return rate;
    }
  } catch (e) {
    console.warn("Could not fetch USD→INR rate:", e?.message);
  }
  return usdToInrCache.rate ?? 0;
};

const toPlainObject = (doc) => (doc?.toObject ? doc.toObject() : doc);

const extractPrimaryProduct = (order) => {
  const plainOrder = toPlainObject(order);
  if (!plainOrder) return null;

  const { products } = plainOrder;
  if (Array.isArray(products) && products.length > 0) {
    return products[0];
  }

  return null;
};

const extractMediatorInfo = (mediator) => {
  if (!mediator) {
    return { id: null, formatted: null };
  }

  if (typeof mediator === "object") {
    if (mediator._id) {
      return {
        id: mediator._id,
        formatted: { _id: mediator._id, name: mediator.name || null },
      };
    }

    if (typeof mediator.toString === "function") {
      const asString = mediator.toString();
      if (mongoose.Types.ObjectId.isValid(asString)) {
        return { id: asString, formatted: null };
      }
    }

    return { id: null, formatted: null };
  }

  const mediatorString = String(mediator);
  if (mongoose.Types.ObjectId.isValid(mediatorString)) {
    return { id: mediator, formatted: null };
  }

  return { id: null, formatted: null };
};

const pickProductByHints = (products, hints = {}) => {
  if (!Array.isArray(products) || products.length === 0) {
    return null;
  }

  const {
    productNameHint,
    sellingPriceHint,
    purchasePriceHint,
    initialPaymentHint,
  } = hints;

  const normalizeName = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

  if (productNameHint) {
    const target = normalizeName(productNameHint);
    const matchByName = products.find(
      (product) => normalizeName(product?.productName) === target
    );
    if (matchByName) return matchByName;
  }

  const roundedSellingHint =
    sellingPriceHint !== undefined && sellingPriceHint !== null
      ? roundAmount(sellingPriceHint)
      : null;

  if (roundedSellingHint !== null) {
    const matchBySelling = products.find(
      (product) => roundAmount(product?.sellingPrice) === roundedSellingHint
    );
    if (matchBySelling) return matchBySelling;
  }

  const roundedPurchaseHint =
    purchasePriceHint !== undefined && purchasePriceHint !== null
      ? roundAmount(purchasePriceHint)
      : null;

  if (roundedPurchaseHint !== null) {
    const matchByPurchase = products.find(
      (product) => roundAmount(product?.purchasePrice) === roundedPurchaseHint
    );
    if (matchByPurchase) return matchByPurchase;
  }

  const roundedInitialHint =
    initialPaymentHint !== undefined && initialPaymentHint !== null
      ? roundAmount(initialPaymentHint)
      : null;

  if (roundedInitialHint !== null) {
    const matchByInitial = products.find(
      (product) => roundAmount(product?.initialPayment) === roundedInitialHint
    );
    if (matchByInitial) return matchByInitial;
  }

  return products[0];
};

const getOrderProductDetails = (order, hints = {}) => {
  const plainOrder = toPlainObject(order);

  if (!plainOrder) {
    return {
      productName: "",
      purchasePrice: 0,
      sellingPrice: 0,
      initialPayment: 0,
      mediator: null,
      mediatorId: null,
      products: [],
      matchedProduct: null,
    };
  }

  const primaryProduct = extractPrimaryProduct(plainOrder);
  const matchedProduct =
    pickProductByHints(
      Array.isArray(plainOrder.products) ? plainOrder.products : [],
      hints
    ) || primaryProduct;
  const mediatorSource =
    matchedProduct?.mediator ?? primaryProduct?.mediator ?? plainOrder.mediator ?? null;
  const mediatorInfo = extractMediatorInfo(mediatorSource);

  const paymentCurrency = matchedProduct?.paymentCurrency ?? primaryProduct?.paymentCurrency ?? "INR";
  const sellingPriceRaw = roundAmount(
    matchedProduct?.sellingPrice ??
      primaryProduct?.sellingPrice ??
      plainOrder.sellingPrice ??
      0
  );
  return {
    productName: matchedProduct?.productName || plainOrder.product || "",
    purchasePrice: roundAmount(
      matchedProduct?.purchasePrice ??
        primaryProduct?.purchasePrice ??
        plainOrder.purchasePrice ??
        0
    ),
    sellingPrice: sellingPriceRaw,
    paymentCurrency: paymentCurrency === "USD" ? "USD" : "INR",
    initialPayment: roundAmount(
      matchedProduct?.initialPayment ??
        primaryProduct?.initialPayment ??
        plainOrder.initialPayment ??
        0
    ),
    mediator: mediatorInfo.formatted,
    mediatorId: mediatorInfo.id,
    products: Array.isArray(plainOrder.products) ? plainOrder.products : [],
    matchedProduct,
  };
};

// format mediator amount details with populated mediator info
// usdToInrRate: when > 0 and amounts are in USD, convert to INR
const formatMediatorAmountDetails = (mediatorAmountArray, mediatorDetails = [], usdToInrRate = 0) => {
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

    // Only include amount if it exists and is not null/undefined; convert USD→INR when rate provided
    if (item.amount !== undefined && item.amount !== null) {
      let amt = Math.round(item.amount * 100) / 100;
      if (usdToInrRate > 0) amt = roundAmount(amt * usdToInrRate);
      result.amount = amt;
    }

    return result;
  });
};

// format order mediator info (only mediator, mediatorAmount is now in Income model)
const formatOrderMediatorInfo = (order, hints = {}) => {
  if (!order) return null;

  const plainOrder = toPlainObject(order);
  const productDetails = getOrderProductDetails(plainOrder, hints);

  return {
    _id: plainOrder._id,
    orderId: plainOrder.orderId,
    clientName: plainOrder.clientName,
    product: productDetails.productName,
    sellingPrice: productDetails.sellingPrice,
    initialPayment: productDetails.initialPayment,
    mediator: productDetails.mediator,
    products: productDetails.products,
  };
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

    // Parse page and limit to integers with proper defaults and validation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;
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

    // ====================== CASE 1: CREDITS (Payment + ManualBankEntry) ======================
    if (incExpType == 1) {
      const Order = (await import("../models/order.js")).default;
      const paymentQuery = {
        paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
        actualBankCreditINR: { $exists: true, $ne: null, $gt: 0 },
        bankId: { $exists: true, $ne: null },
        isDeleted: { $ne: true },
        ...orderFilter,
      };
      if (dateFilter) {
        paymentQuery.creditedDate = paymentQuery.creditedDate || {};
        Object.assign(paymentQuery.creditedDate, dateFilter);
      }
      const [paymentData, depositEntries, transferEntries] = await Promise.all([
        orderFilter.orderId
          ? Payment.find(paymentQuery)
              .populate("orderId", "products clientName orderId")
              .populate("bankId", "_id name")
              .sort({ creditedDate: sortOrder === "asc" ? 1 : -1 })
              .lean()
          : Payment.find(paymentQuery)
              .populate("orderId", "products clientName orderId")
              .populate("bankId", "_id name")
              .sort({ creditedDate: sortOrder === "asc" ? 1 : -1 })
              .lean(),
        orderFilter.orderId
          ? []
          : ManualBankEntry.find({ type: "deposit", ...(dateFilter ? { date: dateFilter } : {}) })
              .populate("bankId", "_id name")
              .sort(sortQuery)
              .lean(),
        orderFilter.orderId
          ? []
          : ManualBankEntry.find({ type: "transfer", ...(dateFilter ? { date: dateFilter } : {}) })
              .populate("bankId", "_id name")
              .populate("toBankId", "_id name")
              .sort(sortQuery)
              .lean(),
      ]);

      const creditItems = [];
      paymentData.forEach((p) => {
        const amt = roundAmount(p.actualBankCreditINR || 0);
        if (amt <= 0) return;
        const { bankId: bid, bank } = buildBankResponse(p.bankId);
        const productName = p.orderId?.products?.[0]?.productName || "Payment";
        const formattedOrder = p.orderId
          ? formatOrderMediatorInfo(p.orderId, { productNameHint: productName })
          : null;
        creditItems.push({
          _id: p._id,
          incExpType: 1,
          source: "payment",
          date: p.creditedDate || p.createdAt,
          receivedAmount: amt,
          description: productName,
          bankId: bid,
          bank,
          orderId: formattedOrder,
          clientName: p.orderId?.clientName || "",
          status: "credited_to_bank",
        });
      });
      depositEntries.forEach((e) => {
        const { bankId: bid, bank } = buildBankResponse(e.bankId);
        creditItems.push({
          _id: e._id,
          incExpType: 1,
          source: "manual",
          date: e.date,
          receivedAmount: roundAmount(e.amount || 0),
          description: e.description || "Manual deposit",
          bankId: bid,
          bank,
          orderId: null,
          clientName: "",
          status: "reserved",
        });
      });
      transferEntries.forEach((e) => {
        const toBank = e.toBankId;
        const { bankId: bid, bank } = buildBankResponse(toBank);
        creditItems.push({
          _id: e._id,
          incExpType: 1,
          source: "manual",
          date: e.date,
          receivedAmount: roundAmount(e.amount || 0),
          description: e.description || "Transfer received",
          bankId: bid,
          bank,
          orderId: null,
          clientName: "",
          status: "reserved",
        });
      });

      const filtered = creditItems.filter((item) => {
        if (!search) return true;
        const searchLower = search.toLowerCase().trim();
        const desc = (item.description || "").toLowerCase();
        const clientName = (item.clientName || "").toLowerCase();
        const orderIdStr = (item.orderId?.orderId || "").toLowerCase();
        const bankName = (item.bank?.name || "").toLowerCase();
        let dateStr = "";
        if (item.date) {
          const d = new Date(item.date);
          dateStr = d.toLocaleDateString("en-GB").toLowerCase() + " " + d.toISOString().split("T")[0].toLowerCase();
        }
        return (
          desc.includes(searchLower) ||
          clientName.includes(searchLower) ||
          orderIdStr.includes(searchLower) ||
          bankName.includes(searchLower) ||
          dateStr.includes(searchLower)
        );
      });

      const sorted = filtered.sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        return sortOrder === "asc" ? da - db : db - da;
      });
      total = sorted.length;
      data = sorted.slice(skip, skip + limitNum);
    }

    // ====================== CASE 2: EXPENSE ======================
    else if (incExpType == 2) {
      const deletedOnly = req.query.deletedOnly === "true" || req.query.deletedOnly === true;
      const expenseQuery = {
        ...searchQuery,
        ...orderFilter,
        ...(deletedOnly ? { isDeleted: true } : { isDeleted: { $ne: true } }),
      };
      // For expense, check both date and createdAt fields
      if (dateFilter) {
        expenseQuery.$or = [
          { date: dateFilter },
          { createdAt: dateFilter }
        ];
      }
      
      const expanceData = await ExpanceIncome.find(expenseQuery)
        .populate({
          path: "orderId",
          select: "products clientName orderId",
          populate: {
            path: "products.mediator",
            select: "_id name",
            match: { isDeleted: false },
          },
        })
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

        const productHints = {
          productNameHint: item.description,
          purchasePriceHint: item.dueAmount,
        };
        const productDetails = getOrderProductDetails(item.orderId, productHints);

        // Product Name
        const productName = (productDetails.productName || "").toLowerCase();

        // Description
        const description = (item.description || productDetails.productName || "").toLowerCase();

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
      const sliced = filtered.slice(skip, skip + limitNum);

      data = sliced.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        const productHints = {
          productNameHint: item.description,
          purchasePriceHint: item.dueAmount,
        };
        const productDetails = getOrderProductDetails(item.orderId, productHints);
        return {
          _id: item._id,
          incExpType: 2,
          date: item.date || item.createdAt,
          orderId: item.orderId,
          description: item.description || productDetails.productName || "",
          dueAmount:
            item.dueAmount !== undefined && item.dueAmount !== null
              ? roundAmount(item.dueAmount)
              : productDetails.purchasePrice,
          clientName: item.orderId?.clientName || "",
          paidAmount: roundAmount(item.paidAmount || 0),
          supplierId: item.supplierId?._id || item.supplierId || null,
          supplierName:
            `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
            item.supplierId?.company ||
            "",
          status: item.status,
          bankId,
          bank,
          isDeleted: item.isDeleted || false,
          deletedAt: item.deletedAt || null,
        };
      });

      total = count;
    }

    // ====================== CASE 3: BOTH (Credits + Expense) ======================
    else if (incExpType == 3) {
      const expenseQuery = { ...searchQuery, ...orderFilter, isDeleted: { $ne: true } };
      if (dateFilter) {
        expenseQuery.$or = [
          { date: dateFilter },
          { createdAt: dateFilter }
        ];
      }

      const paymentQueryForBoth = {
        paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
        actualBankCreditINR: { $exists: true, $ne: null, $gt: 0 },
        bankId: { $exists: true, $ne: null },
        isDeleted: { $ne: true },
        ...orderFilter,
      };
      if (dateFilter) {
        paymentQueryForBoth.creditedDate = paymentQueryForBoth.creditedDate || {};
        Object.assign(paymentQueryForBoth.creditedDate, dateFilter);
      }

      const [paymentDataBoth, depositEntriesBoth, transferEntriesBoth, expanceData] = await Promise.all([
        Payment.find(paymentQueryForBoth)
          .populate("orderId", "products clientName orderId")
          .populate("bankId", "_id name")
          .sort({ creditedDate: sortOrder === "asc" ? 1 : -1 })
          .lean(),
        orderFilter.orderId
          ? []
          : ManualBankEntry.find({ type: "deposit", ...(dateFilter ? { date: dateFilter } : {}) })
              .populate("bankId", "_id name")
              .sort(sortQuery)
              .lean(),
        orderFilter.orderId
          ? []
          : ManualBankEntry.find({ type: "transfer", ...(dateFilter ? { date: dateFilter } : {}) })
              .populate("bankId", "_id name")
              .populate("toBankId", "_id name")
              .sort(sortQuery)
              .lean(),
        ExpanceIncome.find(expenseQuery)
          .populate({
            path: "orderId",
            select: "products clientName orderId",
            populate: {
              path: "products.mediator",
              select: "_id name",
              match: { isDeleted: false },
            },
          })
          .populate("supplierId", "firstName lastName company supplierId")
          .populate({
            path: "bankId",
            select: "_id name",
            match: { isDeleted: false },
          })
          .sort(sortQuery)
          .lean(),
      ]);

      const incomeList = [];
      paymentDataBoth.forEach((p) => {
        const amt = roundAmount(p.actualBankCreditINR || 0);
        if (amt <= 0) return;
        const { bankId: bid, bank } = buildBankResponse(p.bankId);
        const productName = p.orderId?.products?.[0]?.productName || "Payment";
        const formattedOrder = p.orderId
          ? formatOrderMediatorInfo(p.orderId, { productNameHint: productName })
          : null;
        incomeList.push({
          _id: p._id,
          incExpType: 1,
          source: "payment",
          date: p.creditedDate || p.createdAt,
          receivedAmount: amt,
          description: productName,
          bankId: bid,
          bank,
          orderId: formattedOrder,
          clientName: p.orderId?.clientName || "",
          status: "credited_to_bank",
        });
      });
      depositEntriesBoth.forEach((e) => {
        const { bankId: bid, bank } = buildBankResponse(e.bankId);
        incomeList.push({
          _id: e._id,
          incExpType: 1,
          source: "manual",
          date: e.date,
          receivedAmount: roundAmount(e.amount || 0),
          description: e.description || "Manual deposit",
          bankId: bid,
          bank,
          orderId: null,
          clientName: "",
          status: "reserved",
        });
      });
      transferEntriesBoth.forEach((e) => {
        const toBank = e.toBankId;
        const { bankId: bid, bank } = buildBankResponse(toBank);
        incomeList.push({
          _id: e._id,
          incExpType: 1,
          source: "manual",
          date: e.date,
          receivedAmount: roundAmount(e.amount || 0),
          description: e.description || "Transfer received",
          bankId: bid,
          bank,
          orderId: null,
          clientName: "",
          status: "reserved",
        });
      });

      const expanceList = expanceData.map((item) => {
        const { bankId, bank } = buildBankResponse(item.bankId);
        const productHints = {
          productNameHint: item.description,
          purchasePriceHint: item.dueAmount,
        };
        const productDetails = getOrderProductDetails(item.orderId, productHints);
        return {
          _id: item._id,
          incExpType: 2,
          date: item.date || item.createdAt,
          orderId: item.orderId,
          description: item.description || productDetails.productName || "",
          product: productDetails.productName || "",
          dueAmount:
            item.dueAmount !== undefined && item.dueAmount !== null
              ? roundAmount(item.dueAmount)
              : productDetails.purchasePrice,
          clientName: item.orderId?.clientName || "",
          paidAmount: roundAmount(item.paidAmount || 0),
          supplierId: item.supplierId?._id || item.supplierId || null,
          supplierName:
            `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
            item.supplierId?.company ||
            "",
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
        const productName = (item.product || "").toLowerCase();

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
      data = sorted.slice(skip, skip + limitNum);
    }

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // ✅ Final Response
    res.status(200).json({
      status: 200,
      message: "Income and Expense fetched successfully",
      data: {
        total,
        page: pageNum,
        limit: limitNum,
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

// Add Expense Entry (linked to order & supplier)
export const addExpanseEntry = async (req, res) => {
  try {
    const { orderId, date, description, paidAmount, dueAmount, status, bankId } = req.body;

    // ✅ Validate required fields
    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: "orderId is required",
      });
    }

    if (!description) {
      return res.status(400).json({
        status: 400,
        message: "description is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        status: 400,
        message: "date is required",
      });
    }

    if (paidAmount === undefined || paidAmount === null) {
      return res.status(400).json({
        status: 400,
        message: "paidAmount is required",
      });
    }

    // Validate paidAmount is a valid number
    const paidAmountNum = parseFloat(paidAmount);
    if (isNaN(paidAmountNum) || paidAmountNum < 0) {
      return res.status(400).json({
        status: 400,
        message: "paidAmount must be a valid positive number or 0",
      });
    }

    // Validate dueAmount if provided
    let dueAmountNum = null;
    if (dueAmount !== undefined && dueAmount !== null) {
      dueAmountNum = parseFloat(dueAmount);
      if (isNaN(dueAmountNum) || dueAmountNum < 0) {
        return res.status(400).json({
          status: 400,
          message: "dueAmount must be a valid positive number or 0",
        });
      }
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
    const supplierName = (order.supplier || order.supplierName || "").trim();

    if (!supplierName) {
      return res.status(400).json({
        status: 400,
        message: "Supplier not associated with this order",
      });
    }

    const supplier = await Supplier.findOne({
      $or: [
        { firstName: new RegExp(supplierName, "i") },
        { lastName: new RegExp(supplierName, "i") },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: supplierName,
              options: "i",
            },
          },
        },
        { company: new RegExp(supplierName, "i") },
      ],
    });

    if (!supplier) {
      return res.status(404).json({
        status: 404,
        message: "Supplier not found for this order",
      });
    }

    // ✅ bankId is optional - only normalize if provided
    let normalizedBankId = null;
    if (bankId !== undefined && bankId !== null && bankId !== "") {
      try {
        normalizedBankId = await normalizeBankIdOrThrow(bankId);
      } catch (error) {
        return res.status(error.status || 400).json({
          status: error.status || 400,
          message: error.message || "Invalid bank ID",
        });
      }
    }

    // Get order product details for matching
    const orderProductDetails = getOrderProductDetails(order, {
      productNameHint: description,
    });

    // Validate date format
    const expenseDate = new Date(date);
    if (isNaN(expenseDate.getTime())) {
      return res.status(400).json({
        status: 400,
        message: "Invalid date format",
      });
    }

    // Determine status: if paidAmount > 0, set to provided status or "paid", otherwise "pending"
    let expenseStatus = status || "pending";
    if (paidAmountNum > 0 && !status) {
      expenseStatus = "paid";
    } else if (paidAmountNum === 0) {
      expenseStatus = "pending";
    }

    // Calculate dueAmount: use provided dueAmount, or try to get from order products
    let finalDueAmount = 0;
    if (dueAmountNum !== null) {
      // Use provided dueAmount
      finalDueAmount = dueAmountNum;
    } else {
      // Try to get from order product details
      finalDueAmount = orderProductDetails.purchasePrice || 0;
      
      // If still 0, try to find product by matching description with product names
      if (finalDueAmount === 0 && Array.isArray(order.products) && order.products.length > 0) {
        const descriptionLower = description.toLowerCase().trim();
        const matchedProduct = order.products.find(product => {
          const productName = (product.productName || "").toLowerCase().trim();
          return productName === descriptionLower || productName.includes(descriptionLower) || descriptionLower.includes(productName);
        });
        
        if (matchedProduct && matchedProduct.purchasePrice) {
          finalDueAmount = roundAmount(matchedProduct.purchasePrice);
        } else if (order.products[0] && order.products[0].purchasePrice) {
          // Fallback to first product's purchasePrice
          finalDueAmount = roundAmount(order.products[0].purchasePrice);
        }
      }
    }

    // ✅ Create new expense entry (supports multiple per order)
    const newExpense = await ExpanceIncome.create({
      date: expenseDate,
      orderId: order._id,
      description: description.trim(),
      dueAmount: roundAmount(finalDueAmount),
      paidAmount: roundAmount(paidAmountNum),
      supplierId: supplier._id,
      status: expenseStatus,
      bankId: normalizedBankId,
    });

    // ✅ Populate for response
    const populatedExpense = await ExpanceIncome.findById(newExpense._id)
      .populate({
        path: "orderId",
        select: "products clientName orderId",
        populate: {
          path: "products.mediator",
          select: "_id name",
          match: { isDeleted: false },
        },
      })
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    // ✅ Invalidate cache after expense creation
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('income');
    invalidateCache('dashboard');

    const expenseResponse = docToPlainWithBank(populatedExpense);

    return res.status(200).json({
      status: 200,
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

    // Save original status and paidAmount BEFORE updates (needed for supplier deduction logic)
    const originalStatus = existingExpense.status?.toLowerCase();
    const originalPaidAmount = existingExpense.paidAmount || 0;

    // Get base purchasePrice (original price) to calculate dueAmount
    // Strategy: dueAmount + paidAmount = original purchase price
    const currentDueAmount = existingExpense.dueAmount || 0;
    const currentPaidAmount = existingExpense.paidAmount || 0;
    let basePurchasePrice = currentDueAmount + currentPaidAmount;
    
    // If the sum is 0 or seems incorrect, try to get from order
    if (basePurchasePrice === 0 && existingExpense.orderId) {
      const orderProductDetails = getOrderProductDetails(existingExpense.orderId, {
        productNameHint: description || existingExpense.description,
      });
      if (orderProductDetails.purchasePrice > 0) {
        basePurchasePrice = orderProductDetails.purchasePrice;
      }
    }
    
    // If still 0, use current dueAmount as fallback (assuming it's the original price)
    if (basePurchasePrice === 0) {
      basePurchasePrice = currentDueAmount;
    }

    // Update fields
    if (date) existingExpense.date = date;
    if (description) existingExpense.description = description;
    
    // Update paidAmount and recalculate dueAmount
    if (paidAmount !== undefined) {
      const newPaidAmount = Math.round(paidAmount * 100) / 100;
      existingExpense.paidAmount = newPaidAmount;
      
      // Recalculate dueAmount: basePurchasePrice - paidAmount
      const newDueAmount = Math.max(0, basePurchasePrice - newPaidAmount);
      existingExpense.dueAmount = Math.round(newDueAmount * 100) / 100;
    }
    
    // ALWAYS recalculate status based on current paidAmount (after any updates)
    // This ensures status is always correct regardless of what fields are updated
    const finalPaidAmount = existingExpense.paidAmount || 0;
    if (finalPaidAmount > 0) {
      existingExpense.status = "paid";
    } else {
      existingExpense.status = "pending";
    }
    
    // Only override status if explicitly provided in request
    if (status !== undefined && status !== null && status !== "") {
      existingExpense.status = status;
    }

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

    // Recalculate remaining amount (for backward compatibility)
    existingExpense.remainingAmount =
      Math.round(((existingExpense.dueAmount || 0) - (existingExpense.paidAmount || 0)) * 100) / 100;

    const finalStatus = existingExpense.status?.toLowerCase();
    const finalPaidAmountValue = existingExpense.paidAmount || 0;
    const hasBankId = existingExpense.bankId != null && (existingExpense.bankId._id || existingExpense.bankId);

    if (finalStatus === "paid" && finalPaidAmountValue > 0 && !hasBankId) {
      return res.status(400).json({
        status: 400,
        message: "Bank is required when marking expense as Paid. Please select a bank and save.",
      });
    }

    // Deduct from supplier's advancePayment if status is PAID
    // Calculate amount to deduct from supplier's advancePayment
    // Logic:
    // 1. If status changes from non-"paid" to "paid": deduct the paidAmount at that time
    // 2. If status is already "paid" and paidAmount increases: deduct only the difference
    let amountToDeduct = 0;
    
    if (finalStatus === "paid" && finalPaidAmountValue > 0 && existingExpense.supplierId) {
      if (originalStatus !== "paid") {
        // Status changed from non-"paid" to "paid": deduct the current paidAmount
        amountToDeduct = finalPaidAmountValue;
      } else {
        // Status was already "paid": deduct only the difference (increase in paidAmount)
        const paidAmountDifference = finalPaidAmountValue - originalPaidAmount;
        if (paidAmountDifference > 0) {
          amountToDeduct = paidAmountDifference;
        }
      }
    }
    
    // Only deduct if there's an amount to deduct and status is "paid"
    if (amountToDeduct > 0 && finalStatus === "paid") {
      const Supplier = (await import("../models/supplier.js")).default;
      const supplierId = existingExpense.supplierId._id || existingExpense.supplierId;
      
      const supplier = await Supplier.findById(supplierId);
      if (supplier) {
        // Ensure advancePayment is an array
        if (!Array.isArray(supplier.advancePayment)) {
          supplier.advancePayment = [];
        }

        // Calculate total advancePayment across all banks
        const totalAdvancePayment = supplier.advancePayment.reduce((sum, payment) => {
          return sum + (parseFloat(payment.amount) || 0);
        }, 0);

        // Only deduct if advancePayment total is greater than 0
        if (totalAdvancePayment > 0) {
          // Deduct the calculated amount (difference or full amount) from advancePayment
          // Example: paidAmount increased from 200 to 400, deduct 200 (the difference)
          let remainingToDeduct = amountToDeduct;

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

          await supplier.save();
        }
      }
    }

    // Save updated document
    await existingExpense.save();

    const populatedExpense = await ExpanceIncome.findById(ExpId)
      .populate({
        path: "orderId",
        select: "products clientName orderId",
        populate: {
          path: "products.mediator",
          select: "_id name",
          match: { isDeleted: false },
        },
      })
      .populate("supplierId", "firstName lastName company")
      .populate({
        path: "bankId",
        select: "_id name",
        match: { isDeleted: false },
      });

    const expenseResponse = docToPlainWithBank(populatedExpense);

    // ✅ Invalidate cache after expense update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    const { clearCacheByRoute } = await import("../middlewares/cache.js");
    
    invalidateCache('income');
    invalidateCache('dashboard');
    
    // Invalidate supplier cache to ensure getSupplierOrderDetails returns fresh data
    if (existingExpense.supplierId) {
      const supplierId = existingExpense.supplierId._id || existingExpense.supplierId;
      invalidateCache('supplier', supplierId);
      invalidateCache('supplier');
      // Clear supplier-orderdetails cache to ensure fresh data
      clearCacheByRoute(`/supplier-orderdetails/${supplierId}`);
      clearCacheByRoute('/supplier-orderdetails');
    }

    return res.status(200).json({
      message: "Expense entry updated successfully",
      data: expenseResponse,
    });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
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

    // ✅ Invalidate cache after extra expense creation
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('income');
    invalidateCache('dashboard');

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

    // ✅ Invalidate cache after extra expense update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('income');
    invalidateCache('dashboard');

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
      .populate({
        path: "orderId",
        select: "products clientName orderId",
        populate: {
          path: "products.mediator",
          select: "_id name",
          match: { isDeleted: false },
        },
      })
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

    const productDetails = getOrderProductDetails(expense.orderId, {
      productNameHint: expense.description,
      purchasePriceHint: expense.dueAmount,
    });

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
      product: productDetails.productName || "",
      status: expense.status,
      bankId: expenseBankId,
      bank: expenseBank,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

// Soft delete expense (sets isDeleted: true, deletedAt: Date)
export const softDeleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;

    if (!expenseId) {
      return res.status(400).json({
        status: 400,
        message: "expenseId is required",
      });
    }

    const expense = await ExpanceIncome.findById(expenseId);
    if (!expense) {
      return res.status(404).json({
        status: 404,
        message: "Expense entry not found",
      });
    }

    if (expense.isDeleted) {
      return res.status(400).json({
        status: 400,
        message: "Expense is already deleted",
      });
    }

    expense.isDeleted = true;
    expense.deletedAt = new Date();
    await expense.save();

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("income");
    invalidateCache("dashboard");

    return res.status(200).json({
      status: 200,
      message: "Expense deleted successfully",
      data: { _id: expense._id, isDeleted: true, deletedAt: expense.deletedAt },
    });
  } catch (error) {
    console.error("Error soft-deleting expense:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default {
  getIncomeExpance,
  addExpanseEntry,
  editExpanseEntry,
  addExtraExpense,
  editExtraExpense,
  getExpenseById,
  softDeleteExpense,
};
