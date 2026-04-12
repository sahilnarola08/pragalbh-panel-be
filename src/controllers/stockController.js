import mongoose from "mongoose";
import Stock, { STOCK_STATUS_VALUES } from "../models/stock.js";
import Product from "../models/product.js";
import Supplier from "../models/supplier.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const normalizePurchaseSupplierLines = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const row of raw) {
    const supplierName = (row?.supplierName ?? row?.supplier ?? "").toString().trim();
    const price = round2(row?.price ?? row?.amount ?? 0);
    const note = typeof row?.note === "string" ? row.note.trim() : "";
    if (!supplierName && price <= 0) continue;
    out.push({ supplierName, price, note });
  }
  return out;
};

const supplierNameDbMatch = (name) => {
  const term = String(name || "").trim();
  if (!term) return null;
  return {
    $or: [
      { firstName: { $regex: term, $options: "i" } },
      { lastName: { $regex: term, $options: "i" } },
      { company: { $regex: term, $options: "i" } },
      {
        $expr: {
          $regexMatch: {
            input: { $concat: ["$firstName", " ", "$lastName"] },
            regex: term,
            options: "i",
          },
        },
      },
    ],
    isDeleted: false,
  };
};

const extractProductImages = (input) => {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input) && input.length === 0) return [];
  const arrayInput = Array.isArray(input) ? input : [input];
  return arrayInput
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const t = item.trim();
        return t ? { img: t } : null;
      }
      if (typeof item === "object" && item !== null) {
        const c = item.img ?? item.url ?? item.imageUrl;
        if (typeof c === "string" && c.trim()) return { img: c.trim() };
      }
      return null;
    })
    .filter(Boolean);
};

export const createStock = async (req, res) => {
  try {
    const {
      productName,
      supplierName,
      purchasePrice,
      purchaseSupplierLines,
      productImages,
      stockDate,
      quantity,
      notes,
    } = req.body;

    const pname = String(productName || "").trim();
    if (!pname) {
      return sendErrorResponse({ res, message: "productName is required", status: 400 });
    }

    const existingProduct = await Product.findOne({
      productName: new RegExp(`^${pname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      isDeleted: false,
    })
      .select("_id productName")
      .lean();

    if (!existingProduct) {
      return sendErrorResponse({
        res,
        message: `Product "${pname}" does not exist. Add it under Products first.`,
        status: 400,
      });
    }

    const lines = normalizePurchaseSupplierLines(purchaseSupplierLines);
    let priceTotal = round2(purchasePrice);
    let supplierId = null;
    let primarySupplierName = String(supplierName || "").trim();
    let linesForDb;

    if (lines.length > 0) {
      linesForDb = [];
      for (const line of lines) {
        if (!line.supplierName) {
          return sendErrorResponse({
            res,
            message: "Each purchase supplier line must have a supplier name.",
            status: 400,
          });
        }
        if (line.price <= 0) {
          return sendErrorResponse({
            res,
            message: "Each purchase supplier line must have price greater than 0.",
            status: 400,
          });
        }
        const supDoc = await Supplier.findOne(supplierNameDbMatch(line.supplierName)).select("_id").lean();
        if (!supDoc) {
          return sendErrorResponse({
            res,
            message: `Supplier "${line.supplierName}" does not exist.`,
            status: 400,
          });
        }
        linesForDb.push({
          supplierName: line.supplierName,
          price: line.price,
          note: line.note,
        });
      }
      priceTotal = round2(linesForDb.reduce((s, l) => s + l.price, 0));
    } else {
      if (priceTotal <= 0) {
        return sendErrorResponse({
          res,
          message: "purchasePrice must be greater than 0 (or add supplier lines).",
          status: 400,
        });
      }
      if (primarySupplierName) {
        const sup = await Supplier.findOne(supplierNameDbMatch(primarySupplierName)).select("_id").lean();
        if (!sup) {
          return sendErrorResponse({
            res,
            message: `Supplier "${primarySupplierName}" does not exist.`,
            status: 400,
          });
        }
        supplierId = sup._id;
      }
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const doc = await Stock.create({
      productName: existingProduct.productName,
      productId: existingProduct._id,
      supplierName: primarySupplierName,
      supplierId,
      purchasePrice: priceTotal,
      purchaseSupplierLines: linesForDb,
      productImages: extractProductImages(productImages),
      stockDate: stockDate ? new Date(stockDate) : new Date(),
      quantity: qty,
      notes: typeof notes === "string" ? notes.trim() : "",
      status: STOCK_STATUS_VALUES.IN_STOCK,
    });

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("stock");

    return sendSuccessResponse({
      res,
      data: doc.toObject(),
      message: "Stock created successfully",
      status: 200,
    });
  } catch (err) {
    console.error("createStock:", err);
    return sendErrorResponse({ res, message: err.message || "Failed to create stock", status: 500 });
  }
};

export const listStocks = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = (req.query.search || "").trim();

    const filter = { isDeleted: { $ne: true } };
    if (status && Object.values(STOCK_STATUS_VALUES).includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { productName: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { stockCode: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { notes: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      ];
    }

    const [items, total] = await Promise.all([
      Stock.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Stock.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      data: { items, total, page, limit },
      message: "OK",
      status: 200,
    });
  } catch (err) {
    console.error("listStocks:", err);
    return sendErrorResponse({ res, message: "Failed to list stocks", status: 500 });
  }
};

export const getStockById = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid id", status: 400 });
    }
    const doc = await Stock.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!doc) {
      return sendErrorResponse({ res, message: "Stock not found", status: 404 });
    }
    return sendSuccessResponse({ res, data: doc, message: "OK", status: 200 });
  } catch (err) {
    console.error("getStockById:", err);
    return sendErrorResponse({ res, message: "Failed to get stock", status: 500 });
  }
};

export const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid id", status: 400 });
    }
    const doc = await Stock.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) {
      return sendErrorResponse({ res, message: "Stock not found", status: 404 });
    }
    if (doc.status !== STOCK_STATUS_VALUES.IN_STOCK) {
      return sendErrorResponse({
        res,
        message: "Only stock in 'in_stock' status can be edited.",
        status: 400,
      });
    }

    const {
      supplierName,
      purchasePrice,
      purchaseSupplierLines,
      productImages,
      stockDate,
      quantity,
      notes,
    } = req.body;

    if (notes !== undefined) doc.notes = typeof notes === "string" ? notes.trim() : doc.notes;
    if (stockDate !== undefined) doc.stockDate = stockDate ? new Date(stockDate) : doc.stockDate;
    if (quantity !== undefined) doc.quantity = Math.max(1, parseInt(quantity, 10) || 1);
    if (productImages !== undefined) doc.productImages = extractProductImages(productImages);

    const lines = purchaseSupplierLines !== undefined ? normalizePurchaseSupplierLines(purchaseSupplierLines) : null;
    if (lines && lines.length > 0) {
      const linesForDb = [];
      for (const line of lines) {
        if (!line.supplierName || line.price <= 0) {
          return sendErrorResponse({ res, message: "Invalid supplier lines", status: 400 });
        }
        const supDoc = await Supplier.findOne(supplierNameDbMatch(line.supplierName)).select("_id").lean();
        if (!supDoc) {
          return sendErrorResponse({
            res,
            message: `Supplier "${line.supplierName}" does not exist.`,
            status: 400,
          });
        }
        linesForDb.push({
          supplierName: line.supplierName,
          price: line.price,
          note: line.note,
        });
      }
      doc.purchaseSupplierLines = linesForDb;
      doc.purchasePrice = round2(linesForDb.reduce((s, l) => s + l.price, 0));
      doc.supplierName = "";
      doc.supplierId = null;
    } else if (purchasePrice !== undefined || supplierName !== undefined) {
      const pp = round2(purchasePrice !== undefined ? purchasePrice : doc.purchasePrice);
      if (pp <= 0) {
        return sendErrorResponse({ res, message: "purchasePrice must be greater than 0", status: 400 });
      }
      doc.purchasePrice = pp;
      const sn = supplierName !== undefined ? String(supplierName || "").trim() : doc.supplierName;
      doc.supplierName = sn;
      doc.purchaseSupplierLines = undefined;
      if (sn) {
        const sup = await Supplier.findOne(supplierNameDbMatch(sn)).select("_id").lean();
        if (!sup) {
          return sendErrorResponse({ res, message: `Supplier "${sn}" does not exist.`, status: 400 });
        }
        doc.supplierId = sup._id;
      } else {
        doc.supplierId = null;
      }
    }

    await doc.save();
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("stock");

    return sendSuccessResponse({
      res,
      data: doc.toObject(),
      message: "Stock updated",
      status: 200,
    });
  } catch (err) {
    console.error("updateStock:", err);
    return sendErrorResponse({ res, message: err.message || "Failed to update stock", status: 500 });
  }
};

export const deleteStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid id", status: 400 });
    }
    const doc = await Stock.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) {
      return sendErrorResponse({ res, message: "Stock not found", status: 404 });
    }
    if (doc.status !== STOCK_STATUS_VALUES.IN_STOCK) {
      return sendErrorResponse({
        res,
        message: "Only in-stock items can be removed from the list.",
        status: 400,
      });
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("stock");
    return sendSuccessResponse({ res, data: {}, message: "Stock deleted", status: 200 });
  } catch (err) {
    console.error("deleteStock:", err);
    return sendErrorResponse({ res, message: "Failed to delete stock", status: 500 });
  }
};

export default {
  createStock,
  listStocks,
  getStockById,
  updateStock,
  deleteStock,
};
