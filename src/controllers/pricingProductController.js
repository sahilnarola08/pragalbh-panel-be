import PricingProduct from "../models/pricingProduct.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

export const list = async (req, res) => {
  try {
    const list = await PricingProduct.find()
      .sort({ name: 1 })
      .lean();
    const data = list.map((r) => ({ id: r._id.toString(), name: r.name }));
    return sendSuccessResponse({ res, data, message: "Products list" });
  } catch (error) {
    console.error("Pricing product list error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Products (unavailable)" });
  }
};

export const create = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return sendErrorResponse({ res, message: "Product name is required", status: 400 });
    }
    const doc = await PricingProduct.create({ name });
    return sendSuccessResponse({
      res,
      data: { id: doc._id.toString(), name: doc.name },
      message: "Product added",
    });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const name = req.body.name != null ? String(req.body.name).trim() : null;
    const doc = await PricingProduct.findById(id);
    if (!doc) {
      return sendErrorResponse({ res, message: "Product not found", status: 404 });
    }
    if (name !== null) doc.name = name;
    await doc.save();
    return sendSuccessResponse({
      res,
      data: { id: doc._id.toString(), name: doc.name },
      message: "Product updated",
    });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await PricingProduct.findByIdAndDelete(id);
    if (!doc) {
      return sendErrorResponse({ res, message: "Product not found", status: 404 });
    }
    return sendSuccessResponse({ res, data: null, message: "Product deleted" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};
