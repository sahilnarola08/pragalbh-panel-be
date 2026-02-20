import Mediator from "../models/mediator.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";

const create = async (req, res) => {
  try {
    const { name, commissionType, commissionValue, settlementDelayDays, isActive } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return sendErrorResponse({ res, status: 400, message: "Name is required" });
    }
    const type = commissionType === "fixed" ? "fixed" : "percentage";
    const value = Math.max(0, Number(commissionValue) || 0);
    const delay = Math.max(0, parseInt(settlementDelayDays, 10) || 0);
    const doc = await Mediator.create({
      name: name.trim(),
      commissionType: type,
      commissionValue: value,
      settlementDelayDays: delay,
      isActive: isActive !== false,
    });
    return sendSuccessResponse({ res, status: 201, data: doc, message: "Mediator created successfully" });
  } catch (err) {
    console.error("Mediator create error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to create mediator" });
  }
};

const getAll = async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "", isActive } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;
    const filter = {};
    if (isActive !== undefined && isActive !== "") {
      filter.isActive = String(isActive) === "true";
    }
    if (search && String(search).trim()) {
      filter.name = { $regex: String(search).trim(), $options: "i" };
    }
    const [items, totalCount] = await Promise.all([
      Mediator.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      Mediator.countDocuments(filter),
    ]);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return sendSuccessResponse({
      res,
      status: 200,
      data: {
        mediators: items,
        totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      message: "Mediators retrieved successfully",
    });
  } catch (err) {
    console.error("Mediator getAll error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to fetch mediators" });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Invalid mediator ID" });
    }
    const doc = await Mediator.findById(id).lean();
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Mediator not found" });
    }
    return sendSuccessResponse({ res, status: 200, data: doc, message: "Mediator retrieved successfully" });
  } catch (err) {
    console.error("Mediator getById error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to fetch mediator" });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, commissionType, commissionValue, settlementDelayDays, isActive } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Invalid mediator ID" });
    }
    const updateFields = {};
    if (name !== undefined) updateFields.name = String(name).trim();
    if (commissionType !== undefined) updateFields.commissionType = commissionType === "fixed" ? "fixed" : "percentage";
    if (commissionValue !== undefined) updateFields.commissionValue = Math.max(0, Number(commissionValue) || 0);
    if (settlementDelayDays !== undefined) updateFields.settlementDelayDays = Math.max(0, parseInt(settlementDelayDays, 10) || 0);
    if (typeof isActive === "boolean") updateFields.isActive = isActive;
    const doc = await Mediator.findByIdAndUpdate(id, { $set: updateFields }, { new: true, runValidators: true }).lean();
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Mediator not found" });
    }
    return sendSuccessResponse({ res, status: 200, data: doc, message: "Mediator updated successfully" });
  } catch (err) {
    console.error("Mediator update error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to update mediator" });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ res, status: 400, message: "Invalid mediator ID" });
    }
    const doc = await Mediator.findByIdAndDelete(id);
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Mediator not found" });
    }
    return sendSuccessResponse({ res, status: 200, data: { _id: id }, message: "Mediator deleted successfully" });
  } catch (err) {
    console.error("Mediator delete error:", err);
    return sendErrorResponse({ res, status: 500, message: err.message || "Failed to delete mediator" });
  }
};

export default { create, getAll, getById, update, remove };
