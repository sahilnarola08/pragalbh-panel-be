import { crmLocalAuthService } from "../services/crmLocalAuthService.js";
import { crmPanelAdapter } from "../services/crmPanelAdapterService.js";
import { crmTelemetry } from "../services/crmTelemetryService.js";
import crypto from "crypto";

const unwrapPanelData = (response) => response?.data ?? response;

const withPanelToken = async (req, cb) => {
  const panelAccessToken = await crmLocalAuthService.getSessionPanelToken(req.crmAuth?.sid);
  return cb(panelAccessToken);
};

const maybeTrackScopeDenied = (error) => {
  const message = String(error?.message || "").toLowerCase();
  if (error?.status === 403 && message.includes("scope")) {
    crmTelemetry.recordScopeDenied();
  }
};

const listCustomers = async (req, res, next) => {
  try {
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.listCustomers(panelToken, req.query)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Customers",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.getCustomerById(panelToken, req.params.id)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Customer",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.updateCustomer(panelToken, req.params.id, req.body)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Customer updated",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

const listFollowups = async (req, res, next) => {
  try {
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.listFollowups(panelToken, req.params.customerId, req.query)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Followups",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

const createFollowup = async (req, res, next) => {
  try {
    const requestId =
      req.headers["x-idempotency-key"] || req.body?.requestId || crypto.randomUUID?.();
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.createFollowup(panelToken, req.params.customerId, req.body, requestId)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Followup created",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

const updateFollowup = async (req, res, next) => {
  try {
    const payload = await withPanelToken(req, (panelToken) =>
      crmPanelAdapter.updateFollowup(panelToken, req.params.id, req.body)
    );
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "Followup updated",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    maybeTrackScopeDenied(error);
    next(error);
  }
};

export default {
  listCustomers,
  getCustomerById,
  updateCustomer,
  listFollowups,
  createFollowup,
  updateFollowup,
};
