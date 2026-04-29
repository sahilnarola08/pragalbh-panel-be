import mongoose from "mongoose";
import User from "../models/user.js";
import Auth from "../models/auth.js";
import CrmFollowup from "../models/crmFollowup.js";
import CrmLead from "../models/crmLead.js";
import CrmPipeline from "../models/crmPipeline.js";
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

function leadSearchFilter(search) {
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
      { notes: regex },
      { "noteEntries.text": regex },
      { source: regex },
      { labels: regex },
    ],
  };
}

function normalizeObjectIdArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => mongoose.Types.ObjectId.isValid(value));
}

function normalizeLeadPlatforms(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      platformName: String(item?.platformName || "").trim(),
      platformUsername: String(item?.platformUsername || "").trim(),
    }))
    .filter((item) => mongoose.Types.ObjectId.isValid(item.platformName));
}

function normalizeLeadLabels(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeLeadNoteEntries(values, actorId) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      text: String(item?.text || item?.note || "").trim(),
      createdAt: item?.createdAt ? new Date(item.createdAt) : new Date(),
      createdByUserId: item?.createdByUserId || actorId || null,
    }))
    .filter((item) => item.text);
}

function parseDateParam(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function hasLeadWideAccess(req) {
  return Boolean(req?.crm?.canViewAllLeads);
}

function hasLeadAssignAccess(req) {
  return Boolean(req?.crm?.canAssignLeads);
}

function isLeadOwner(req, ownerUserId) {
  return String(ownerUserId || "") === String(req?.user?._id || "");
}

function assertLeadOwnership(req, lead) {
  if (!lead) return false;
  if (hasLeadWideAccess(req)) return true;
  return isLeadOwner(req, lead.ownerUserId);
}

async function getAssignableLeadOwner(ownerUserId) {
  const id = String(ownerUserId || "").trim();
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Auth.findOne({
    _id: id,
    isDeleted: false,
    isActive: true,
    "crmAccess.enabled": true,
  })
    .select("_id")
    .lean();
}

function appendLeadEvent(lead, event, actorId) {
  if (!lead) return;
  lead.activityEvents = Array.isArray(lead.activityEvents) ? lead.activityEvents : [];
  const message = String(event?.message || "").trim();
  if (!message) return;
  lead.activityEvents.push({
    type: String(event?.type || "activity").trim() || "activity",
    message,
    metadata: event?.metadata || {},
    createdAt: new Date(),
    createdByUserId: actorId || null,
  });
}

async function findOrCreateCustomerFromLeadPayload(payload) {
  const email = String(payload?.email || "").trim();
  const contactNumber = String(payload?.contactNumber || "").trim();
  let existing = null;
  if (email || contactNumber) {
    existing = await User.findOne({
      isDeleted: false,
      $or: [{ ...(email ? { email } : {}) }, { ...(contactNumber ? { contactNumber } : {}) }].filter(
        (item) => Object.keys(item).length > 0
      ),
    });
  }

  if (existing) {
    const updates = {};
    if (!existing.firstName && payload.firstName) updates.firstName = payload.firstName;
    if (!existing.lastName && payload.lastName) updates.lastName = payload.lastName;
    if (!existing.address && payload.address) updates.address = payload.address;
    if (!existing.company && payload.company) updates.company = payload.company;
    if (!existing.email && email) updates.email = email;
    if (!existing.contactNumber && contactNumber) updates.contactNumber = contactNumber;
    if ((!Array.isArray(existing.clientType) || existing.clientType.length === 0) && payload.clientType?.length) {
      updates.clientType = payload.clientType;
    }
    if ((!Array.isArray(existing.platforms) || existing.platforms.length === 0) && payload.platforms?.length) {
      updates.platforms = payload.platforms;
    }
    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: existing._id }, { $set: updates });
      existing = await User.findById(existing._id);
    }
    return existing;
  }

  return User.create({
    firstName: payload.firstName || "Unknown",
    lastName: payload.lastName || "Lead",
    address: payload.address || "",
    contactNumber: contactNumber || undefined,
    platforms: payload.platforms || [],
    email: email || "",
    clientType: payload.clientType || [],
    company: payload.company || "",
  });
}

function normalizeStageKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultPipelineStages() {
  return [
    { key: "new", label: "New Lead" },
    { key: "contacted", label: "Contacted" },
    { key: "qualified", label: "Qualified" },
  ];
}

function sanitizePipelineStages(rawStages) {
  if (!Array.isArray(rawStages) || rawStages.length === 0) return defaultPipelineStages();
  const used = new Set();
  const stages = [];
  for (const item of rawStages) {
    const label = String(item?.label || item?.name || "").trim();
    if (!label) continue;
    let key = normalizeStageKey(item?.key || label);
    if (!key) key = `stage_${stages.length + 1}`;
    if (used.has(key)) continue;
    used.add(key);
    stages.push({ key, label });
  }
  return stages.length > 0 ? stages : defaultPipelineStages();
}

async function ensureDefaultPipeline(actorId) {
  let pipeline = await CrmPipeline.findOne({ isDefault: true, isActive: true });
  if (!pipeline) {
    pipeline = await CrmPipeline.findOne({ isActive: true }).sort({ createdAt: 1 });
  }
  if (!pipeline) {
    pipeline = await CrmPipeline.create({
      name: "Regular Clients",
      description: "Default CRM pipeline",
      isDefault: true,
      isActive: true,
      stages: defaultPipelineStages(),
      createdByUserId: actorId,
      updatedByUserId: actorId,
    });
  }
  if (!Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    pipeline.stages = defaultPipelineStages();
    pipeline.updatedByUserId = actorId;
    await pipeline.save();
  }
  return pipeline;
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

export async function listCrmLeads(req, res, next) {
  try {
    if (!req.crm?.canViewLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.view" });
    }
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {
      ...leadSearchFilter(req.query.search),
    };
    if (req.query.status) filter.status = String(req.query.status);
    const currentUserId = String(req.user._id);
    if (req.query.owner === "me") {
      filter.ownerUserId = req.user._id;
    } else if (req.query.ownerId !== undefined) {
      const ownerId = String(req.query.ownerId || "").trim();
      if (ownerId) {
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
          return sendErrorResponse({ status: 400, res, message: "Invalid owner id" });
        }
        if (!hasLeadWideAccess(req) && ownerId !== currentUserId) {
          return sendErrorResponse({ status: 403, res, message: "Cannot view other users' leads" });
        }
        filter.ownerUserId = ownerId;
      }
    } else if (!hasLeadWideAccess(req)) {
      filter.ownerUserId = req.user._id;
    }
    if (req.query.pipelineId && mongoose.Types.ObjectId.isValid(String(req.query.pipelineId))) {
      filter.pipelineId = String(req.query.pipelineId);
    }
    if (req.query.convertedCustomerId && mongoose.Types.ObjectId.isValid(String(req.query.convertedCustomerId))) {
      const cid = String(req.query.convertedCustomerId);
      if (!ensureCustomerInCrmScope(req, cid)) {
        return sendErrorResponse({ status: 403, res, message: "Customer not accessible" });
      }
      filter.convertedCustomerId = cid;
    }
    const createdFrom = parseDateParam(req.query.createdFrom, false);
    const createdTo = parseDateParam(req.query.createdTo, true);
    if ((req.query.createdFrom && !createdFrom) || (req.query.createdTo && !createdTo)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid date filter" });
    }
    if (createdFrom || createdTo) {
      filter.createdAt = {};
      if (createdFrom) filter.createdAt.$gte = createdFrom;
      if (createdTo) filter.createdAt.$lte = createdTo;
    }
    const nextFollowupFrom = parseDateParam(req.query.nextFollowupFrom, false);
    const nextFollowupTo = parseDateParam(req.query.nextFollowupTo, true);
    if ((req.query.nextFollowupFrom && !nextFollowupFrom) || (req.query.nextFollowupTo && !nextFollowupTo)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid next follow-up date filter" });
    }
    if (nextFollowupFrom || nextFollowupTo) {
      filter.nextFollowupAt = {};
      if (nextFollowupFrom) filter.nextFollowupAt.$gte = nextFollowupFrom;
      if (nextFollowupTo) filter.nextFollowupAt.$lte = nextFollowupTo;
    }

    const sortableFields = new Set(["updatedAt", "createdAt", "nextFollowupAt", "priority", "status"]);
    const sortBy = sortableFields.has(String(req.query.sortBy || "")) ? String(req.query.sortBy) : "updatedAt";
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [items, total] = await Promise.all([
      CrmLead.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      CrmLead.countDocuments(filter),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM leads",
      data: { items, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCrmLead(req, res, next) {
  try {
    if (!req.crm?.canCreateLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.create" });
    }
    const defaultPipeline = await ensureDefaultPipeline(req.user._id);
    const requestedPipelineId = String(req.body.pipelineId || "").trim();
    let pipelineId = defaultPipeline?._id || null;
    let selectedPipeline = defaultPipeline;
    if (requestedPipelineId && mongoose.Types.ObjectId.isValid(requestedPipelineId)) {
      const pipeline = await CrmPipeline.findOne({ _id: requestedPipelineId, isActive: true });
      if (pipeline) {
        pipelineId = pipeline._id;
        selectedPipeline = pipeline;
      }
    }
    const stages = sanitizePipelineStages(selectedPipeline?.stages);
    const requestedStatus = String(req.body.status || "").trim();
    const initialStatus = requestedStatus && stages.some((s) => s.key === requestedStatus)
      ? requestedStatus
      : stages[0]?.key || "new";

    const clientType = normalizeObjectIdArray(req.body.clientType);
    const platforms = normalizeLeadPlatforms(req.body.platforms);
    const leadPlatform = mongoose.Types.ObjectId.isValid(String(req.body.leadPlatform || ""))
      ? String(req.body.leadPlatform)
      : null;
    const accountName =
      leadPlatform && mongoose.Types.ObjectId.isValid(String(req.body.accountName || ""))
        ? String(req.body.accountName)
        : null;
    const labels = normalizeLeadLabels(req.body.labels);
    const noteEntries = normalizeLeadNoteEntries(req.body.noteEntries, req.user._id);
    const initialNote = String(req.body.notes || "").trim();
    if (initialNote) {
      noteEntries.push({
        text: initialNote,
        createdAt: new Date(),
        createdByUserId: req.user._id,
      });
    }
    const requestedOwnerUserId = String(req.body.ownerUserId || "").trim();
    let nextOwnerUserId = req.user._id;
    if (requestedOwnerUserId) {
      if (!mongoose.Types.ObjectId.isValid(requestedOwnerUserId)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid owner id" });
      }
      if (requestedOwnerUserId !== String(req.user._id)) {
        if (!hasLeadAssignAccess(req)) {
          return sendErrorResponse({ status: 403, res, message: "Missing permission to assign leads" });
        }
        const assignee = await getAssignableLeadOwner(requestedOwnerUserId);
        if (!assignee) {
          return sendErrorResponse({ status: 400, res, message: "Assignee not found or CRM is disabled" });
        }
        nextOwnerUserId = assignee._id;
      }
    }
    const payload = {
      firstName: String(req.body.firstName || "").trim(),
      lastName: String(req.body.lastName || "").trim(),
      company: String(req.body.company || "").trim(),
      address: String(req.body.address || "").trim(),
      email: String(req.body.email || "").trim(),
      contactNumber: String(req.body.contactNumber || "").trim(),
      clientType,
      platforms,
      leadPlatform,
      accountName,
      labels,
      source: String(req.body.source || "manual").trim(),
      productInterest: String(req.body.productInterest || "").trim(),
      notes: initialNote,
      noteEntries,
      status: initialStatus,
      priority: req.body.priority || "medium",
      pipelineId,
      nextFollowupAt: req.body.nextFollowupAt || null,
      ownerUserId: nextOwnerUserId,
      updatedByUserId: req.user._id,
    };
    payload.activityEvents = [
      {
        type: "created",
        message: "Lead created",
        metadata: { status: payload.status, pipelineId: payload.pipelineId || null },
        createdAt: new Date(),
        createdByUserId: req.user._id,
      },
    ];

    const customer = await findOrCreateCustomerFromLeadPayload(payload);
    if (customer?._id) {
      payload.convertedCustomerId = customer._id;
    }

    const created = await CrmLead.create(payload);
    return sendSuccessResponse({
      res,
      status: 201,
      message: "CRM lead created",
      data: { lead: created, customer },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCrmLead(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid lead id" });
    }
    const lead = await CrmLead.findById(id);
    if (!lead) return sendErrorResponse({ status: 404, res, message: "Lead not found" });
    if (!assertLeadOwnership(req, lead)) {
      return sendErrorResponse({ status: 403, res, message: "Lead is not assigned to you" });
    }
    const prevStatus = String(lead.status || "");
    const prevPipelineId = String(lead.pipelineId || "");
    const prevOwner = String(lead.ownerUserId || "");

    const allowed = [
      "firstName",
      "lastName",
      "company",
      "address",
      "email",
      "contactNumber",
      "source",
      "productInterest",
      "notes",
      "status",
      "priority",
      "nextFollowupAt",
      "leadPlatform",
      "accountName",
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) lead[key] = req.body[key];
    }
    if (req.body.clientType !== undefined) {
      lead.clientType = normalizeObjectIdArray(req.body.clientType);
    }
    if (req.body.platforms !== undefined) {
      lead.platforms = normalizeLeadPlatforms(req.body.platforms);
    }
    if (req.body.noteEntries !== undefined) {
      lead.noteEntries = normalizeLeadNoteEntries(req.body.noteEntries, req.user._id);
      lead.notes = lead.noteEntries.length > 0 ? String(lead.noteEntries[lead.noteEntries.length - 1].text || "") : "";
    }
    if (req.body.labels !== undefined) {
      lead.labels = normalizeLeadLabels(req.body.labels);
    }
    if (req.body.leadPlatform !== undefined) {
      const requestedLeadPlatform = String(req.body.leadPlatform || "").trim();
      if (requestedLeadPlatform && !mongoose.Types.ObjectId.isValid(requestedLeadPlatform)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid lead platform id" });
      }
      lead.leadPlatform = requestedLeadPlatform || null;
      if (!lead.leadPlatform) {
        lead.accountName = null;
      }
    }
    if (req.body.accountName !== undefined) {
      const requestedAccountName = String(req.body.accountName || "").trim();
      if (requestedAccountName && !mongoose.Types.ObjectId.isValid(requestedAccountName)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid account name id" });
      }
      lead.accountName = lead.leadPlatform ? requestedAccountName || null : null;
    }
    if (req.body.addNote !== undefined) {
      const noteText = String(req.body.addNote || "").trim();
      if (noteText) {
        lead.noteEntries = Array.isArray(lead.noteEntries) ? lead.noteEntries : [];
        lead.noteEntries.push({
          text: noteText,
          createdAt: new Date(),
          createdByUserId: req.user._id,
        });
        lead.notes = noteText;
        appendLeadEvent(lead, { type: "note", message: `Note added: ${noteText}` }, req.user._id);
      }
    }
    if (req.body.ownerUserId !== undefined) {
      const requestedOwnerUserId = String(req.body.ownerUserId || "").trim();
      if (!requestedOwnerUserId) {
        return sendErrorResponse({ status: 400, res, message: "Lead owner is required" });
      }
      if (!mongoose.Types.ObjectId.isValid(requestedOwnerUserId)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid owner id" });
      }
      if (requestedOwnerUserId !== prevOwner) {
        if (!hasLeadAssignAccess(req)) {
          return sendErrorResponse({ status: 403, res, message: "Missing permission to assign leads" });
        }
        const assignee = await getAssignableLeadOwner(requestedOwnerUserId);
        if (!assignee) {
          return sendErrorResponse({ status: 400, res, message: "Assignee not found or CRM is disabled" });
        }
        lead.ownerUserId = assignee._id;
      }
    }
    if (req.body.pipelineId !== undefined) {
      const requested = String(req.body.pipelineId || "").trim();
      if (requested && !mongoose.Types.ObjectId.isValid(requested)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid pipeline id" });
      }
      if (requested) {
        const pipeline = await CrmPipeline.findOne({ _id: requested, isActive: true });
        if (!pipeline) {
          return sendErrorResponse({ status: 400, res, message: "Pipeline not found or inactive" });
        }
      }
      lead.pipelineId = requested || null;
    }
    lead.updatedByUserId = req.user._id;
    if (String(lead.status || "") !== prevStatus) {
      appendLeadEvent(
        lead,
        {
          type: "stage_change",
          message: `Stage changed from ${prevStatus || "-"} to ${String(lead.status || "-")}`,
          metadata: { from: prevStatus, to: String(lead.status || "") },
        },
        req.user._id
      );
    }
    if (String(lead.pipelineId || "") !== prevPipelineId) {
      appendLeadEvent(
        lead,
        {
          type: "pipeline_change",
          message: "Pipeline changed",
          metadata: { from: prevPipelineId || null, to: String(lead.pipelineId || "") || null },
        },
        req.user._id
      );
    }
    if (String(lead.ownerUserId || "") !== prevOwner) {
      appendLeadEvent(
        lead,
        {
          type: "owner_change",
          message: "Owner reassigned",
          metadata: { from: prevOwner || null, to: String(lead.ownerUserId || "") || null },
        },
        req.user._id
      );
    }
    await lead.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM lead updated",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCrmLead(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid lead id" });
    }
    const filter = { _id: id };
    if (!hasLeadWideAccess(req)) {
      filter.ownerUserId = req.user._id;
    }
    const deleted = await CrmLead.findOneAndDelete(filter);
    if (!deleted) return sendErrorResponse({ status: 404, res, message: "Lead not found" });
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM lead deleted",
      data: { deletedId: id },
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkUpdateCrmLeads(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      : [];
    if (ids.length === 0) {
      return sendErrorResponse({ status: 400, res, message: "No valid lead ids provided" });
    }
    const update = {};
    if (req.body.status !== undefined) update.status = String(req.body.status || "");
    if (req.body.ownerUserId !== undefined) {
      if (!hasLeadAssignAccess(req)) {
        return sendErrorResponse({ status: 403, res, message: "Missing permission to assign leads" });
      }
      const requestedOwnerUserId = String(req.body.ownerUserId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(requestedOwnerUserId)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid owner id" });
      }
      const assignee = await getAssignableLeadOwner(requestedOwnerUserId);
      if (!assignee) {
        return sendErrorResponse({ status: 400, res, message: "Assignee not found or CRM is disabled" });
      }
      update.ownerUserId = assignee._id;
    }
    if (req.body.pipelineId !== undefined) {
      const requested = String(req.body.pipelineId || "").trim();
      if (requested && !mongoose.Types.ObjectId.isValid(requested)) {
        return sendErrorResponse({ status: 400, res, message: "Invalid pipeline id" });
      }
      update.pipelineId = requested || null;
    }
    if (req.body.nextFollowupAt !== undefined) {
      update.nextFollowupAt = req.body.nextFollowupAt || null;
    }
    if (Object.keys(update).length === 0) {
      return sendErrorResponse({ status: 400, res, message: "No update fields provided" });
    }
    update.updatedByUserId = req.user._id;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
    const leadFilter = { _id: { $in: objectIds } };
    if (!hasLeadWideAccess(req)) {
      leadFilter.ownerUserId = req.user._id;
    }
    await CrmLead.updateMany(leadFilter, { $set: update });

    const eventMessage = String(req.body.eventMessage || "Bulk update applied").trim();
    await CrmLead.updateMany(
      leadFilter,
      {
        $push: {
          activityEvents: {
            type: "bulk_update",
            message: eventMessage,
            metadata: { update },
            createdAt: new Date(),
            createdByUserId: req.user._id,
          },
        },
      }
    );

    const refreshed = await CrmLead.find(leadFilter).lean();
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM leads bulk updated",
      data: { count: refreshed.length, items: refreshed },
    });
  } catch (error) {
    next(error);
  }
}

export async function convertCrmLead(req, res, next) {
  try {
    if (!req.crm?.canConvertLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.convert" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid lead id" });
    }
    const lead = await CrmLead.findById(id);
    if (!lead) return sendErrorResponse({ status: 404, res, message: "Lead not found" });
    if (!assertLeadOwnership(req, lead)) {
      return sendErrorResponse({ status: 403, res, message: "Lead is not assigned to you" });
    }
    if (lead.status === "converted" && lead.convertedCustomerId) {
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Lead already converted",
        data: { lead },
      });
    }

    let customer = null;
    if (lead.convertedCustomerId && mongoose.Types.ObjectId.isValid(String(lead.convertedCustomerId))) {
      customer = await User.findById(lead.convertedCustomerId);
    }
    if (!customer) {
      customer = await findOrCreateCustomerFromLeadPayload({
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        address: lead.address,
        email: lead.email,
        contactNumber: lead.contactNumber,
        clientType: lead.clientType,
        platforms: lead.platforms,
      });
    }

    lead.status = "converted";
    lead.convertedCustomerId = customer._id;
    lead.convertedAt = new Date();
    lead.updatedByUserId = req.user._id;
    appendLeadEvent(
      lead,
      {
        type: "converted",
        message: "Lead converted to customer",
        metadata: { customerId: customer._id },
      },
      req.user._id
    );
    await lead.save();

    let createdFollowup = null;
    if (req.crm?.canCreateFollowups) {
      const due = new Date();
      due.setDate(due.getDate() + 2);
      createdFollowup = await CrmFollowup.create({
        customerId: customer._id,
        title: "Post-conversion welcome follow-up",
        notes: `Auto-created from lead conversion (${lead._id})`,
        status: "open",
        priority: "medium",
        dueAt: due,
        sourceSystem: "crm",
        updatedByUserId: req.user._id,
      });
    }

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Lead converted to customer",
      data: { lead, customer, followup: createdFollowup },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCrmLeadFollowup(req, res, next) {
  try {
    if (!req.crm?.canCreateFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.followups.create" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid lead id" });
    }
    const lead = await CrmLead.findById(id);
    if (!lead) return sendErrorResponse({ status: 404, res, message: "Lead not found" });
    if (!assertLeadOwnership(req, lead)) {
      return sendErrorResponse({ status: 403, res, message: "Lead is not assigned to you" });
    }
    if (!lead.convertedCustomerId) {
      return sendErrorResponse({ status: 400, res, message: "Lead must be converted before follow-up" });
    }
    if (!ensureCustomerInCrmScope(req, lead.convertedCustomerId)) {
      return sendErrorResponse({ status: 403, res, message: "Client outside CRM scope" });
    }

    const due = req.body?.dueAt ? new Date(req.body.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const followup = await CrmFollowup.create({
      customerId: lead.convertedCustomerId,
      title: String(req.body?.title || `Lead follow-up: ${lead.firstName || ""} ${lead.lastName || ""}`).trim(),
      notes: String(req.body?.notes || `Created from lead (${lead._id})`).trim(),
      status: "open",
      priority: req.body?.priority || "medium",
      dueAt: due,
      sourceSystem: "crm",
      updatedByUserId: req.user._id,
    });

    return sendSuccessResponse({
      res,
      status: 201,
      message: "Lead follow-up created",
      data: followup,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCrmWorkQueue(req, res, next) {
  try {
    if (!req.crm?.canViewFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.followups.view" });
    }
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const baseFilter = {
      status: { $in: ["open", "in_progress"] },
      ...(req.crm.accessMode === "all"
        ? {}
        : req.crm.allowedCustomerIds.length > 0
          ? { customerId: { $in: req.crm.allowedCustomerIds } }
          : { customerId: { $in: [] } }),
    };

    const [overdue, today, week] = await Promise.all([
      CrmFollowup.find({ ...baseFilter, dueAt: { $lt: now } }).sort({ dueAt: 1 }).limit(100).lean(),
      CrmFollowup.find({ ...baseFilter, dueAt: { $gte: todayStart, $lt: todayEnd } })
        .sort({ dueAt: 1 })
        .limit(100)
        .lean(),
      CrmFollowup.find({ ...baseFilter, dueAt: { $gte: now, $lt: endOfWeek } })
        .sort({ dueAt: 1 })
        .limit(100)
        .lean(),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM work queue",
      data: { overdue, today, week },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCrmOverviewMetrics(req, res, next) {
  try {
    if (!req.crm?.canViewLeads && !req.crm?.canViewFollowups) {
      return sendErrorResponse({ status: 403, res, message: "Missing CRM view permission" });
    }
    const from = parseDateParam(req.query.from, false);
    const to = parseDateParam(req.query.to, true);
    if ((req.query.from && !from) || (req.query.to && !to)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid date range" });
    }
    const now = new Date();
    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = from;
      if (to) dateFilter.createdAt.$lte = to;
    }

    const leadFilter = { ...dateFilter };
    if (!hasLeadWideAccess(req)) {
      leadFilter.ownerUserId = req.user._id;
    }
    if (req.query.ownerId && mongoose.Types.ObjectId.isValid(String(req.query.ownerId))) {
      const requestedOwnerId = String(req.query.ownerId);
      if (!hasLeadWideAccess(req) && requestedOwnerId !== String(req.user._id)) {
        return sendErrorResponse({ status: 403, res, message: "Cannot view other users' leads" });
      }
      leadFilter.ownerUserId = requestedOwnerId;
    } else if (req.query.owner === "me") {
      leadFilter.ownerUserId = req.user._id;
    }
    if (req.query.pipelineId && mongoose.Types.ObjectId.isValid(String(req.query.pipelineId))) {
      leadFilter.pipelineId = String(req.query.pipelineId);
    }

    const followupFilter = {
      ...dateFilter,
      ...(req.crm.accessMode === "all"
        ? {}
        : req.crm.allowedCustomerIds.length > 0
          ? { customerId: { $in: req.crm.allowedCustomerIds } }
          : { customerId: { $in: [] } }),
    };

    const [leads, followups] = await Promise.all([
      req.crm?.canViewLeads
        ? CrmLead.find(leadFilter).select("status ownerUserId source createdAt updatedAt").lean()
        : [],
      req.crm?.canViewFollowups
        ? CrmFollowup.find(followupFilter).select("status priority dueAt createdAt updatedAt").lean()
        : [],
    ]);

    const totalLeads = leads.length;
    const convertedLeads = leads.filter((lead) => String(lead?.status || "") === "converted").length;
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

    const stageCounts = leads.reduce((acc, lead) => {
      const key = String(lead?.status || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const sourceCounts = leads.reduce((acc, lead) => {
      const key = String(lead?.source || "unknown").trim() || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const leadAging = {
      under3d: 0,
      from3to7d: 0,
      above7d: 0,
    };
    for (const lead of leads) {
      const status = String(lead?.status || "");
      if (status === "converted" || status === "lost") continue;
      const updatedAtTs = lead?.updatedAt ? new Date(lead.updatedAt).getTime() : 0;
      if (!updatedAtTs) continue;
      const diffDays = Math.floor((Date.now() - updatedAtTs) / (24 * 60 * 60 * 1000));
      if (diffDays < 3) leadAging.under3d += 1;
      else if (diffDays <= 7) leadAging.from3to7d += 1;
      else leadAging.above7d += 1;
    }

    const openFollowups = followups.filter((item) =>
      ["open", "in_progress"].includes(String(item?.status || ""))
    );
    const overdueFollowups = openFollowups.filter((item) => item?.dueAt && new Date(item.dueAt) < now);
    const doneFollowups = followups.filter((item) => String(item?.status || "") === "completed");

    const followupOverdueBuckets = { lt24h: 0, d1to7: 0, gt7: 0 };
    for (const item of overdueFollowups) {
      if (!item?.dueAt) continue;
      const overdueDays = (now.getTime() - new Date(item.dueAt).getTime()) / (24 * 60 * 60 * 1000);
      if (overdueDays < 1) followupOverdueBuckets.lt24h += 1;
      else if (overdueDays <= 7) followupOverdueBuckets.d1to7 += 1;
      else followupOverdueBuckets.gt7 += 1;
    }

    const ownerMap = leads.reduce((acc, lead) => {
      const key = String(lead?.ownerUserId || "unassigned");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ownerEntries = Object.entries(ownerMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const ownerIds = ownerEntries
      .map(([id]) => id)
      .filter((id) => id !== "unassigned" && mongoose.Types.ObjectId.isValid(id));
    let ownerNameById = {};
    if (ownerIds.length > 0) {
      const ownerDocs = await Auth.find({ _id: { $in: ownerIds } }).select("name email").lean();
      ownerNameById = Object.fromEntries(
        ownerDocs.map((doc) => [String(doc._id), String(doc?.name || "").trim() || doc?.email || String(doc._id)])
      );
    }
    const ownerLeaderboard = ownerEntries.map(([ownerUserId, leadCount]) => ({
      ownerUserId,
      ownerName:
        ownerUserId === "unassigned"
          ? "Unassigned"
          : ownerNameById[ownerUserId] || ownerUserId,
      leadCount,
    }));

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM overview metrics",
      data: {
        range: { from: from || null, to: to || null },
        leads: {
          total: totalLeads,
          converted: convertedLeads,
          conversionRate,
          stageCounts,
          sourceCounts,
          aging: leadAging,
        },
        followups: {
          total: followups.length,
          open: openFollowups.length,
          overdue: overdueFollowups.length,
          completed: doneFollowups.length,
          overdueBuckets: followupOverdueBuckets,
        },
        ownerLeaderboard,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listCrmAssignableUsers(req, res, next) {
  try {
    if (!req.crm?.canViewLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.view" });
    }
    const filter = {
      isDeleted: false,
      isActive: true,
      "crmAccess.enabled": true,
    };
    if (!hasLeadWideAccess(req) && !hasLeadAssignAccess(req)) {
      filter._id = req.user._id;
    }
    const items = await Auth.find(filter).select("_id name email").sort({ name: 1, email: 1 }).lean();
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM assignable users",
      data: { items },
    });
  } catch (error) {
    next(error);
  }
}

export async function listCrmPipelines(req, res, next) {
  try {
    if (!req.crm?.canViewLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.view" });
    }
    await ensureDefaultPipeline(req.user._id);
    const items = await CrmPipeline.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }).lean();
    const normalizedItems = items.map((item) => ({
      ...item,
      stages: sanitizePipelineStages(item?.stages),
    }));
    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM pipelines",
      data: { items: normalizedItems },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCrmPipeline(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const name = String(req.body.name || "").trim();
    if (!name) {
      return sendErrorResponse({ status: 400, res, message: "Pipeline name is required" });
    }
    const existingDefault = await CrmPipeline.findOne({ isDefault: true, isActive: true });
    const item = await CrmPipeline.create({
      name,
      description: String(req.body.description || "").trim(),
      isDefault: req.body.isDefault === true || !existingDefault,
      isActive: true,
      stages: sanitizePipelineStages(req.body?.stages),
      createdByUserId: req.user._id,
      updatedByUserId: req.user._id,
    });
    if (item.isDefault) {
      await CrmPipeline.updateMany(
        { _id: { $ne: item._id }, isActive: true },
        { $set: { isDefault: false, updatedByUserId: req.user._id } }
      );
    }
    return sendSuccessResponse({
      res,
      status: 201,
      message: "CRM pipeline created",
      data: item,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendErrorResponse({ status: 409, res, message: "Pipeline name already exists" });
    }
    next(error);
  }
}

export async function updateCrmPipeline(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid pipeline id" });
    }
    const item = await CrmPipeline.findById(id);
    if (!item || !item.isActive) {
      return sendErrorResponse({ status: 404, res, message: "Pipeline not found" });
    }

    if (req.body.name !== undefined) item.name = String(req.body.name || "").trim();
    if (req.body.description !== undefined) item.description = String(req.body.description || "").trim();
    if (req.body.isActive !== undefined) item.isActive = Boolean(req.body.isActive);
    if (req.body.isDefault !== undefined) item.isDefault = Boolean(req.body.isDefault);
    let nextStages = null;
    if (req.body.stages !== undefined) {
      nextStages = sanitizePipelineStages(req.body.stages);
      item.stages = nextStages;
    }
    item.updatedByUserId = req.user._id;
    await item.save();

    if (item.isDefault) {
      await CrmPipeline.updateMany(
        { _id: { $ne: item._id }, isActive: true },
        { $set: { isDefault: false, updatedByUserId: req.user._id } }
      );
    }

    // Keep leads visible after stage edits: remap orphan stage keys to first stage.
    if (nextStages && nextStages.length > 0) {
      const validKeys = new Set(nextStages.map((stage) => stage.key));
      const fallbackKey = nextStages[0].key;
      const leads = await CrmLead.find({ pipelineId: item._id }).select("_id status");
      const orphanIds = leads
        .filter((lead) => !validKeys.has(String(lead.status || "")))
        .map((lead) => lead._id);
      if (orphanIds.length > 0) {
        await CrmLead.updateMany(
          { _id: { $in: orphanIds } },
          { $set: { status: fallbackKey, updatedByUserId: req.user._id } }
        );
      }
    }

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM pipeline updated",
      data: item,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendErrorResponse({ status: 409, res, message: "Pipeline name already exists" });
    }
    next(error);
  }
}

export async function deleteCrmPipeline(req, res, next) {
  try {
    if (!req.crm?.canEditLeads) {
      return sendErrorResponse({ status: 403, res, message: "Missing permission: crm.leads.edit" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse({ status: 400, res, message: "Invalid pipeline id" });
    }
    const item = await CrmPipeline.findById(id);
    if (!item || !item.isActive) {
      return sendErrorResponse({ status: 404, res, message: "Pipeline not found" });
    }

    const activeCount = await CrmPipeline.countDocuments({ isActive: true });
    if (activeCount <= 1) {
      return sendErrorResponse({ status: 400, res, message: "At least one active pipeline is required" });
    }

    const fallback = await CrmPipeline.findOne({ _id: { $ne: item._id }, isActive: true }).sort({
      isDefault: -1,
      createdAt: 1,
    });
    if (!fallback) {
      return sendErrorResponse({ status: 400, res, message: "No fallback pipeline available" });
    }

    await CrmLead.updateMany(
      { pipelineId: item._id },
      { $set: { pipelineId: fallback._id, updatedByUserId: req.user._id } }
    );

    item.isActive = false;
    item.isDefault = false;
    item.updatedByUserId = req.user._id;
    await item.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "CRM pipeline deleted",
      data: { deletedId: item._id, reassignedPipelineId: fallback._id },
    });
  } catch (error) {
    next(error);
  }
}

