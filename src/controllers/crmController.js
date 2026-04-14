import mongoose from "mongoose";
import User from "../models/user.js";
import CrmFollowup from "../models/crmFollowup.js";
import { sendErrorResponse, sendSuccessResponse } from "../util/commonResponses.js";
import { getEffectivePermissions } from "../services/permissionResolver.js";
import { ensureCustomerInCrmScope } from "../middlewares/resolveCrmScope.js";
import { getCrmContract } from "../services/crmAccessService.js";

function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function customerSearchFilter(search) {
  const q = String(search || "").trim();
  if (!q) return {};
  const regex = new RegExp(q, "i");
  return {
    $or: [
      { firstName: regex },
      { lastName: regex },
      { company: regex },
      { email: regex },
      { contactNumber: regex },
    ],
  };
}

export async function crmAuthContract(req, res, next) {
  try {
    const permissions = await getEffectivePermissions(req.user._id);
    const contract = getCrmContract(
      { ...req.user.toObject(), sessionId: req.authSessionId || null },
      permissions
    );
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM auth contract",
      data: contract,
    });
  } catch (error) {
    next(error);
  }
}

export async function listCrmClients(req, res, next) {
  try {
    if (!req.crm?.canViewClients) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.clients.view" });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = {
      isDeleted: false,
      ...customerSearchFilter(req.query.search),
    };

    if (req.crm.accessMode !== "all") {
      if (req.crm.allowedCustomerIds.length === 0) {
        return sendSuccessResponse({
          res,
          status: 200,
          message: "CRM clients",
          data: { items: [], total: 0, page, limit },
        });
      }
      filter._id = { $in: req.crm.allowedCustomerIds };
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "clientType", select: "_id name" })
        .populate({ path: "platforms.platformName", select: "_id name" })
        .lean(),
      User.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM clients",
      data: { items, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCrmClientById(req, res, next) {
  try {
    if (!req.crm?.canViewClients) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.clients.view" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid customer id" });
    }
    if (!ensureCustomerInCrmScope(req, id)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const item = await User.findOne({ _id: id, isDeleted: false })
      .populate({ path: "clientType", select: "_id name" })
      .populate({ path: "platforms.platformName", select: "_id name" });
    if (!item) return sendErrorResponse({ status: 404, res, message: "Client not found" });

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM client",
      data: item,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCrmClient(req, res, next) {
  try {
    if (!req.crm?.canEditClients) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.clients.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid customer id" });
    }
    if (!ensureCustomerInCrmScope(req, id)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const allowedFields = [
      "firstName",
      "lastName",
      "address",
      "contactNumber",
      "email",
      "company",
      "platforms",
      "clientType",
    ];
    const update = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) {
      return sendErrorResponse({ status: 400, res, message: "No editable fields provided" });
    }

    const item = await User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate({ path: "clientType", select: "_id name" })
      .populate({ path: "platforms.platformName", select: "_id name" });

    if (!item) return sendErrorResponse({ status: 404, res, message: "Client not found" });
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM client updated",
      data: item,
    });
  } catch (error) {
    next(error);
  }
}

export async function listCrmFollowups(req, res, next) {
  try {
    if (!req.crm?.canViewFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.followups.view" });
    }
    const customerId = req.params.customerId;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid customer id" });
    }
    if (!ensureCustomerInCrmScope(req, customerId)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { customerId };
    if (req.query.status) filter.status = String(req.query.status);
    const [items, total] = await Promise.all([
      CrmFollowup.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CrmFollowup.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM followups",
      data: { items, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCrmFollowup(req, res, next) {
  try {
    if (!req.crm?.canCreateFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.followups.create" });
    }
    const customerId = req.params.customerId;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid customer id" });
    }
    if (!ensureCustomerInCrmScope(req, customerId)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const requestId = String(req.headers["x-idempotency-key"] || req.body.requestId || "").trim();
    if (requestId) {
      const existing = await CrmFollowup.findOne({ customerId, requestId }).lean();
      if (existing) {
        return sendSuccessResponse({
          res,
          status: 200,
          message: "CRM followup already created",
          data: existing,
        });
      }
    }

    const payload = {
      customerId,
      title: String(req.body.title || "").trim(),
      notes: String(req.body.notes || "").trim(),
      status: req.body.status || "open",
      priority: req.body.priority || "medium",
      dueAt: req.body.dueAt || null,
      requestId,
      sourceSystem: String(req.body.sourceSystem || "crm"),
      updatedByUserId: req.user._id,
    };
    const created = await CrmFollowup.create(payload);

    return sendSuccessResponse({
      res,
      status: 201,
      message: "CRM followup created",
      data: created,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendErrorResponse({ status: 409, res, message: "Duplicate followup requestId" });
    }
    next(error);
  }
}

export async function updateCrmFollowup(req, res, next) {
  try {
    if (!req.crm?.canEditFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.followups.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid followup id" });
    }

    const followup = await CrmFollowup.findById(id);
    if (!followup) return sendErrorResponse({ status: 404, res, message: "Followup not found" });
    if (!ensureCustomerInCrmScope(req, followup.customerId)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const allowed = ["title", "notes", "status", "priority", "dueAt"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) followup[key] = req.body[key];
    }
    followup.updatedByUserId = req.user._id;
    followup.sourceSystem = String(req.body.sourceSystem || "crm");
    await followup.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM followup updated",
      data: followup,
    });
  } catch (error) {
    next(error);
  }
}

