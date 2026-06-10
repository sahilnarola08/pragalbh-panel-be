import mongoose from "mongoose";
import Sku from "../models/sku.js";
import SkuTemplate from "../models/skuTemplate.js";
import SkuHistory from "../models/skuHistory.js";
import SkuClient from "../models/skuClient.js";
import Product from "../models/product.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import {
  previewSku,
  generateSku,
  bulkGenerateSku,
  generateVariantSkus,
  getDefaultTemplate,
  recordSkuHistory,
} from "../services/skuGeneratorService.js";
import { parseSkuFromDescription } from "../services/skuAiService.js";
import { getSkuDashboardStats } from "../services/skuDashboardService.js";
import { getSkuMediaAbsolute } from "../services/skuBarcodeService.js";
import {
  SKU_METALS,
  SKU_STONES,
  SKU_COLLECTIONS,
  SKU_VARIANTS,
  JEWELRY_TYPES,
  ORDER_CHANNELS,
} from "../constants/skuConstants.js";
import {
  listSkuCategories,
  getCategoriesMap,
  createSkuCategory,
  updateSkuCategory,
  deleteSkuCategory,
  ensureDefaultCategories,
} from "../services/skuCategoryService.js";
import fs from "fs";

const userId = (req) => req.user?._id || req.user?.id || null;

const mapSkuForClient = (doc) => {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (o.collectionCode != null) o.collection = o.collectionCode;
  return o;
};

export const getSkuOptions = async (req, res) => {
  const categories = await getCategoriesMap();
  return sendSuccessResponse({
    res,
    message: "SKU options retrieved",
    data: {
      categories,
      metals: SKU_METALS,
      stones: SKU_STONES,
      collections: SKU_COLLECTIONS,
      variants: SKU_VARIANTS,
      jewelryTypes: JEWELRY_TYPES,
      orderChannels: ORDER_CHANNELS,
    },
  });
};

export const getSkuCategories = async (req, res) => {
  try {
    const categories = await listSkuCategories();
    return sendSuccessResponse({ res, message: "SKU categories", data: categories });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const createSkuCategoryHandler = async (req, res) => {
  try {
    const { code, label } = req.body;
    const category = await createSkuCategory({ code, label }, userId(req));
    return sendSuccessResponse({
      res,
      message: "SKU category created",
      data: category,
      status: 201,
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: e.statusCode || 500 });
  }
};

export const updateSkuCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid category id", status: 400 });
    }
    const category = await updateSkuCategory(id, req.body, userId(req));
    return sendSuccessResponse({ res, message: "SKU category updated", data: category });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: e.statusCode || 500 });
  }
};

export const deleteSkuCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid category id", status: 400 });
    }
    const category = await deleteSkuCategory(id);
    return sendSuccessResponse({ res, message: "SKU category deleted", data: category });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: e.statusCode || 500 });
  }
};

export const getSkuDashboard = async (req, res) => {
  try {
    const stats = await getSkuDashboardStats();
    return sendSuccessResponse({ res, message: "SKU dashboard", data: stats });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const previewSkuCode = async (req, res) => {
  try {
    const { attributes, templateId, clientId, clientCode } = req.body;
    const result = await previewSku(attributes, { templateId, clientId, clientCode });
    return sendSuccessResponse({ res, message: "SKU preview", data: result });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 400 });
  }
};

export const generateSkuCode = async (req, res) => {
  try {
    const {
      attributes,
      productId,
      productName,
      templateId,
      clientId,
      clientCode,
      persist = true,
      jewelryType,
      orderChannel,
      productImagePath,
    } = req.body;

    const sku = await generateSku(attributes, {
      persist,
      productId,
      productName,
      templateId,
      clientId,
      clientCode,
      jewelryType,
      orderChannel,
      productImagePath,
      createdBy: userId(req),
    });

    if (productId && persist && mongoose.Types.ObjectId.isValid(productId)) {
      await Product.updateOne(
        { _id: productId },
        { $set: { skuCode: sku.skuCode, skuId: sku._id } }
      );
    }

    return sendSuccessResponse({
      res,
      message: persist ? "SKU generated" : "SKU preview (not saved)",
      data: mapSkuForClient(sku),
      status: persist ? 201 : 200,
    });
  } catch (e) {
    return sendErrorResponse({
      res,
      message: e.message,
      status: e.statusCode || 400,
      data: e.validationErrors ? { validationErrors: e.validationErrors } : undefined,
    });
  }
};

export const bulkGenerateSkuCodes = async (req, res) => {
  try {
    const { items, templateId } = req.body;
    const result = await bulkGenerateSku(items, {
      templateId,
      createdBy: userId(req),
    });
    return sendSuccessResponse({
      res,
      message: `Bulk SKU: ${result.created.length} created, ${result.errors.length} failed`,
      data: result,
      status: 201,
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const aiGenerateSku = async (req, res) => {
  try {
    const { description, persist = false } = req.body;
    const parsed = parseSkuFromDescription(description);
    const sku = await generateSku(parsed.attributes, {
      persist,
      productName: description.slice(0, 200),
      createdBy: userId(req),
    });
    return sendSuccessResponse({
      res,
      message: "AI SKU generated",
      data: { parsed, sku },
      status: persist ? 201 : 200,
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: e.statusCode || 400 });
  }
};

export const generateVariants = async (req, res) => {
  try {
    const { parentSkuId, variantCodes } = req.body;
    if (!mongoose.Types.ObjectId.isValid(parentSkuId)) {
      return sendErrorResponse({ res, message: "Invalid parent SKU id", status: 400 });
    }
    const skus = await generateVariantSkus(parentSkuId, variantCodes, {
      createdBy: userId(req),
    });
    return sendSuccessResponse({
      res,
      message: `${skus.length} variant SKUs generated`,
      data: skus,
      status: 201,
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 400 });
  }
};

export const getSkuById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid SKU id", status: 400 });
    }
    const sku = await Sku.findOne({ _id: id, isDeleted: false })
      .populate("productId", "productName category")
      .populate("clientId", "name code")
      .lean();
    if (!sku) {
      return sendErrorResponse({ res, message: "SKU not found", status: 404 });
    }
    const history = await SkuHistory.find({ skuId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return sendSuccessResponse({
      res,
      message: "SKU retrieved",
      data: { ...mapSkuForClient(sku), history },
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const searchSkus = async (req, res) => {
  try {
    const {
      q = "",
      category,
      metal,
      collection,
      clientId,
      page = 1,
      limit = 25,
    } = req.query;

    const filter = { isDeleted: false, previewOnly: false };
    if (category) filter.category = String(category).toUpperCase();
    if (metal) filter.metal = String(metal).toUpperCase();
    if (collection) filter.collectionCode = String(collection).toUpperCase();
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      filter.clientId = clientId;
    }

    if (q && String(q).trim()) {
      const term = String(q).trim();
      filter.$or = [
        { skuCode: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { productName: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit) || 25);
    const lim = Math.min(100, Number(limit) || 25);

    const [items, total] = await Promise.all([
      Sku.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      Sku.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      message: "SKU search results",
      data: {
        items: items.map(mapSkuForClient),
        total,
        page: Number(page),
        limit: lim,
      },
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const updateSku = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid SKU id", status: 400 });
    }

    const sku = await Sku.findOne({ _id: id, isDeleted: false });
    if (!sku) {
      return sendErrorResponse({ res, message: "SKU not found", status: 404 });
    }

    const allowed = [
      "productName",
      "productId",
      "jewelryType",
      "orderChannel",
      "status",
      "workflowRefs",
      "metadata",
      "productImagePath",
    ];
    const changes = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }

    const oldSnapshot = sku.toObject();
    Object.assign(sku, changes);
    sku.modifiedBy = userId(req);
    await sku.save();

    await recordSkuHistory(sku._id, "updated", {
      oldSkuCode: oldSnapshot.skuCode,
      newSkuCode: sku.skuCode,
      changes,
      performedBy: userId(req),
    });

    return sendSuccessResponse({ res, message: "SKU updated", data: sku });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const deleteSku = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid SKU id", status: 400 });
    }

    const sku = await Sku.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), modifiedBy: userId(req) } },
      { new: true }
    );

    if (!sku) {
      return sendErrorResponse({ res, message: "SKU not found", status: 404 });
    }

    await recordSkuHistory(sku._id, "deleted", {
      oldSkuCode: sku.skuCode,
      performedBy: userId(req),
    });

    return sendSuccessResponse({ res, message: "SKU deleted", data: sku });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const listTemplates = async (req, res) => {
  try {
    const templates = await SkuTemplate.find({ isDeleted: false })
      .sort({ isDefault: -1, name: 1 })
      .lean();
    return sendSuccessResponse({ res, message: "SKU templates", data: templates });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const createTemplate = async (req, res) => {
  try {
    if (req.body.isDefault) {
      await SkuTemplate.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    }
    const template = await SkuTemplate.create({
      ...req.body,
      createdBy: userId(req),
    });
    return sendSuccessResponse({
      res,
      message: "SKU template created",
      data: template,
      status: 201,
    });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, message: "Invalid template id", status: 400 });
    }
    if (req.body.isDefault) {
      await SkuTemplate.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    }
    const template = await SkuTemplate.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: req.body },
      { new: true }
    );
    if (!template) {
      return sendErrorResponse({ res, message: "Template not found", status: 404 });
    }
    return sendSuccessResponse({ res, message: "Template updated", data: template });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const listSkuClients = async (req, res) => {
  try {
    const clients = await SkuClient.find({ isDeleted: false }).sort({ name: 1 }).lean();
    return sendSuccessResponse({ res, message: "SKU clients", data: clients });
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const createSkuClient = async (req, res) => {
  try {
    const { name, code, customerId, notes } = req.body;
    const client = await SkuClient.create({
      name,
      code: String(code).toUpperCase(),
      customerId: customerId || null,
      notes: notes || "",
      createdBy: userId(req),
    });
    return sendSuccessResponse({
      res,
      message: "SKU client created",
      data: client,
      status: 201,
    });
  } catch (e) {
    if (e.code === 11000) {
      return sendErrorResponse({ res, message: "Client code already exists", status: 409 });
    }
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const downloadSkuMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const { type = "qr" } = req.query;
    const sku = await Sku.findOne({ _id: id, isDeleted: false }).lean();
    if (!sku) {
      return sendErrorResponse({ res, message: "SKU not found", status: 404 });
    }
    const rel = type === "barcode" ? sku.barcodePath : sku.qrCodePath;
    const abs = getSkuMediaAbsolute(rel);
    if (!abs || !fs.existsSync(abs)) {
      return sendErrorResponse({ res, message: "Media file not found", status: 404 });
    }
    return res.download(abs);
  } catch (e) {
    return sendErrorResponse({ res, message: e.message, status: 500 });
  }
};

export const ensureDefaultTemplate = async () => {
  await ensureDefaultCategories();
  await getDefaultTemplate();
};

export default {
  getSkuOptions,
  getSkuCategories,
  createSkuCategoryHandler,
  updateSkuCategoryHandler,
  deleteSkuCategoryHandler,
  getSkuDashboard,
  previewSkuCode,
  generateSkuCode,
  bulkGenerateSkuCodes,
  aiGenerateSku,
  generateVariants,
  getSkuById,
  searchSkus,
  updateSku,
  deleteSku,
  listTemplates,
  createTemplate,
  updateTemplate,
  listSkuClients,
  createSkuClient,
  downloadSkuMedia,
  ensureDefaultTemplate,
};
