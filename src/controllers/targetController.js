import * as targetService from "../services/targetService.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

const TARGET_TYPES = ["weekly", "monthly", "yearly"];

export const getTargets = async (req, res) => {
  try {
    const list = await targetService.listTargets(req.query);
    const withId = list.map((r) => ({
      id: r._id.toString(),
      ...r,
      _id: undefined,
    }));
    return sendSuccessResponse({
      res,
      data: withId,
      message: "Targets list",
    });
  } catch (error) {
    console.error("Target getTargets error:", error?.message);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to fetch targets",
    });
  }
};

export const getTargetById = async (req, res) => {
  try {
    const doc = await targetService.getTargetById(req.params.id);
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Target not found" });
    }
    const data = { id: doc._id.toString(), ...doc, _id: undefined };
    return sendSuccessResponse({ res, data, message: "Target" });
  } catch (error) {
    console.error("Target getTargetById error:", error?.message);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to fetch target",
    });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const type = (req.query.type || "monthly").toLowerCase();
    if (!TARGET_TYPES.includes(type)) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "type must be weekly, monthly, or yearly",
      });
    }
    const targetDoc = await targetService.findActiveTargetByType(type);
    const summary = await targetService.getDashboardSummary(type, targetDoc);
    return sendSuccessResponse({
      res,
      data: summary,
      message: "Dashboard summary",
    });
  } catch (error) {
    console.error("Target getDashboardSummary error:", error?.message);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to fetch dashboard summary",
    });
  }
};

export const createTarget = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id ?? null;
    const doc = await targetService.createTarget(req.body, userId);
    const data = { id: doc._id.toString(), ...doc.toObject(), _id: undefined };
    return sendSuccessResponse({
      res,
      status: 201,
      data,
      message: "Target created",
    });
  } catch (error) {
    console.error("Target createTarget error:", error?.message);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to create target",
    });
  }
};

export const updateTarget = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id ?? null;
    const doc = await targetService.updateTarget(req.params.id, req.body, userId);
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Target not found" });
    }
    const data = { id: doc._id.toString(), ...doc.toObject(), _id: undefined };
    return sendSuccessResponse({ res, data, message: "Target updated" });
  } catch (error) {
    console.error("Target updateTarget error:", error?.message);
    return sendErrorResponse({
      res,
      status: 500,
      message: error?.message || "Failed to update target",
    });
  }
};

export default {
  getTargets,
  getTargetById,
  getDashboardSummary,
  createTarget,
  updateTarget,
};
