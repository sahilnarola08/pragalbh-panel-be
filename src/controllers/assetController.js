import { sendSuccessResponse } from "../util/commonResponses.js";
import * as assetService from "../services/assetService.js";

const changedBy = (req) => (req.user && req.user._id ? req.user._id : null);

export const listAssets = async (req, res, next) => {
  try {
    const { page, limit, search, ownershipType, partnerId, status } = req.query;
    const data = await assetService.listAssets({
      page,
      limit,
      search,
      ownershipType,
      partnerId,
      status,
    });
    return sendSuccessResponse({ res, data, message: "Assets fetched", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const getAsset = async (req, res, next) => {
  try {
    const data = await assetService.getAssetById(req.params.id);
    return sendSuccessResponse({ res, data, message: "Asset fetched", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const createAsset = async (req, res, next) => {
  try {
    const data = await assetService.createAsset(req.body, changedBy(req));
    return sendSuccessResponse({ res, data, message: "Asset added", status: 201 });
  } catch (e) {
    next(e);
  }
};

export const updateAsset = async (req, res, next) => {
  try {
    const data = await assetService.updateAsset(req.params.id, req.body, changedBy(req));
    return sendSuccessResponse({ res, data, message: "Asset updated", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const changeOwnership = async (req, res, next) => {
  try {
    const data = await assetService.changeOwnership(req.params.id, req.body, changedBy(req));
    return sendSuccessResponse({ res, data, message: "Ownership updated", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const updateValue = async (req, res, next) => {
  try {
    const data = await assetService.updateValue(req.params.id, req.body, changedBy(req));
    return sendSuccessResponse({ res, data, message: "Value updated", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const deleteAsset = async (req, res, next) => {
  try {
    const data = await assetService.softDelete(req.params.id, changedBy(req));
    return sendSuccessResponse({ res, data, message: "Asset removed", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const getHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const data = await assetService.getHistory(req.params.id, { page, limit });
    return sendSuccessResponse({ res, data, message: "History fetched", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const ownershipDistribution = async (req, res, next) => {
  try {
    const data = await assetService.getOwnershipDistribution();
    return sendSuccessResponse({ res, data, message: "Ownership distribution", status: 200 });
  } catch (e) {
    next(e);
  }
};

export const contributionSummary = async (req, res, next) => {
  try {
    const data = await assetService.getContributionSummary();
    return sendSuccessResponse({ res, data, message: "Contribution summary", status: 200 });
  } catch (e) {
    next(e);
  }
};

