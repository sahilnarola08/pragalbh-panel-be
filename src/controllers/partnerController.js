import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as partnerService from "../services/partnerService.js";

const createdBy = (req) => (req.user && req.user._id) ? req.user._id : null;

const listPartners = async (req, res, next) => {
  try {
    const { search, page, limit, isActive } = req.query;
    const result = await partnerService.listPartners({
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
    });
    return sendSuccessResponse({ res, data: result, message: "Partners fetched", status: 200 });
  } catch (err) {
    next(err);
  }
};

const createPartner = async (req, res, next) => {
  try {
    const partner = await partnerService.createPartner(req.body, createdBy(req));
    return sendSuccessResponse({ res, data: partner, message: "Partner created", status: 201 });
  } catch (err) {
    next(err);
  }
};

const getPartnerById = async (req, res, next) => {
  try {
    const partner = await partnerService.getPartnerById(req.params.id);
    return sendSuccessResponse({ res, data: partner, message: "Partner fetched", status: 200 });
  } catch (err) {
    next(err);
  }
};

const updatePartner = async (req, res, next) => {
  try {
    const partner = await partnerService.updatePartner(req.params.id, req.body);
    return sendSuccessResponse({ res, data: partner, message: "Partner updated", status: 200 });
  } catch (err) {
    next(err);
  }
};

const invest = async (req, res, next) => {
  try {
    const partner = await partnerService.invest(req.params.id, req.body, createdBy(req));
    return sendSuccessResponse({ res, data: partner, message: "Investment recorded", status: 200 });
  } catch (err) {
    next(err);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const partner = await partnerService.withdraw(req.params.id, req.body, createdBy(req));
    return sendSuccessResponse({ res, data: partner, message: "Withdrawal recorded", status: 200 });
  } catch (err) {
    next(err);
  }
};

const adjust = async (req, res, next) => {
  try {
    const partner = await partnerService.adjust(req.params.id, req.body, createdBy(req));
    return sendSuccessResponse({ res, data: partner, message: "Balance adjusted", status: 200 });
  } catch (err) {
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { page, limit, deletedOnly } = req.query;
    const result = await partnerService.getTransactions(req.params.id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      deletedOnly: deletedOnly === "true" || deletedOnly === true,
    });
    return sendSuccessResponse({ res, data: result, message: "Transactions fetched", status: 200 });
  } catch (err) {
    next(err);
  }
};

const softDeleteTransaction = async (req, res, next) => {
  try {
    const { id: partnerId, transactionId } = req.params;
    await partnerService.softDeleteTransaction(partnerId, transactionId);
    return sendSuccessResponse({ res, data: { deleted: true }, message: "Transaction deleted", status: 200 });
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await partnerService.getSummary(req.params.id);
    return sendSuccessResponse({ res, data: summary, message: "Summary fetched", status: 200 });
  } catch (err) {
    next(err);
  }
};

export default {
  listPartners,
  createPartner,
  getPartnerById,
  updatePartner,
  invest,
  withdraw,
  adjust,
  getTransactions,
  getSummary,
  softDeleteTransaction,
};
