import mongoose from "mongoose";
import { sendErrorResponse } from "../util/commonResponses.js";
import { getEffectivePermissions } from "../services/permissionResolver.js";

const CRM_ACCESS_PERMISSIONS = [
  "crm.auth.validate",
  "crm.clients.view",
  "crm.clients.edit",
  "crm.followups.view",
  "crm.followups.create",
  "crm.followups.edit",
  "crm.leads.view",
  "crm.leads.create",
  "crm.leads.edit",
  "crm.leads.convert",
  "crm.teams.view",
  "crm.teams.manage",
  "crm.leads.assign.team",
  "crm.leads.assign.owner",
];

export async function resolveCrmScope(req, res, next) {
  try {
    if (!req.user) {
      return sendErrorResponse({ status: 401, res, message: "Unauthorized" });
    }

    const permissions = await getEffectivePermissions(req.user._id);
    const hasCrmPerm = CRM_ACCESS_PERMISSIONS.some((p) => permissions.includes(p));
    if (!hasCrmPerm) {
      return sendErrorResponse({ status: 403, res, message: "CRM access denied for this user" });
    }

    const crmAccess = req.user.crmAccess || {};
    if (!crmAccess.enabled) {
      return sendErrorResponse({ status: 403, res, message: "CRM access is not enabled for this user" });
    }

    const accessMode = crmAccess.accessMode === "all" ? "all" : "selected";
    const rawIds = Array.isArray(crmAccess.allowedCustomerIds) ? crmAccess.allowedCustomerIds : [];
    const allowedCustomerIds = rawIds
      .map((id) => String(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    req.crm = {
      permissions,
      accessMode,
      allowedCustomerIds,
      canManageCrmAccess:
        permissions.includes("crm.access.manage") || permissions.includes("users.manage"),
      canViewClients: permissions.includes("crm.clients.view"),
      canEditClients: permissions.includes("crm.clients.edit"),
      canViewFollowups: permissions.includes("crm.followups.view"),
      canCreateFollowups: permissions.includes("crm.followups.create"),
      canEditFollowups: permissions.includes("crm.followups.edit"),
      canViewLeads:
        permissions.includes("crm.leads.view") || permissions.includes("crm.clients.view"),
      canCreateLeads:
        permissions.includes("crm.leads.create") || permissions.includes("crm.followups.create"),
      canEditLeads:
        permissions.includes("crm.leads.edit") || permissions.includes("crm.followups.edit"),
      canConvertLeads:
        permissions.includes("crm.leads.convert") || permissions.includes("crm.clients.edit"),
      canAssignLeads:
        permissions.includes("crm.access.manage") ||
        permissions.includes("users.manage") ||
        permissions.includes("crm.leads.assign.owner"),
      canAssignLeadTeams:
        permissions.includes("crm.access.manage") ||
        permissions.includes("users.manage") ||
        permissions.includes("crm.leads.assign.team"),
      canViewAllLeads:
        permissions.includes("crm.access.manage") || permissions.includes("users.manage"),
      canViewTeams:
        permissions.includes("crm.teams.view") ||
        permissions.includes("crm.teams.manage") ||
        permissions.includes("crm.access.manage") ||
        permissions.includes("users.manage"),
      canManageTeams:
        permissions.includes("crm.teams.manage") ||
        permissions.includes("crm.access.manage") ||
        permissions.includes("users.manage"),
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function hasCrmWideLeadAccess(req) {
  return Boolean(req?.crm?.canViewAllLeads);
}

/** Customer filter for followups / work queue based on assignment scope. */
export function getFollowupCustomerScopeFilter(req) {
  if (!req.crm) return { customerId: { $in: [] } };
  if (hasCrmWideLeadAccess(req)) {
    if (req.crm.accessMode === "all") return {};
    return req.crm.allowedCustomerIds.length > 0
      ? { customerId: { $in: req.crm.allowedCustomerIds } }
      : { customerId: { $in: [] } };
  }
  const assigned = Array.isArray(req.crm.assignedCustomerIds) ? req.crm.assignedCustomerIds : [];
  return assigned.length > 0 ? { customerId: { $in: assigned } } : { customerId: { $in: [] } };
}

/** Client list filter: team members only see customers from their assigned leads. */
export function getClientScopeFilter(req) {
  if (!req.crm) return { _id: { $in: [] } };
  if (hasCrmWideLeadAccess(req)) {
    if (req.crm.accessMode === "all") return {};
    return req.crm.allowedCustomerIds.length > 0
      ? { _id: { $in: req.crm.allowedCustomerIds } }
      : { _id: { $in: [] } };
  }
  const assigned = Array.isArray(req.crm.assignedCustomerIds) ? req.crm.assignedCustomerIds : [];
  return assigned.length > 0 ? { _id: { $in: assigned } } : { _id: { $in: [] } };
}

export function ensureCustomerInCrmScope(req, customerId) {
  if (!req.crm) return false;
  if (!mongoose.Types.ObjectId.isValid(customerId)) return false;
  if (hasCrmWideLeadAccess(req)) {
    if (req.crm.accessMode === "all") return true;
    return req.crm.allowedCustomerIds.includes(String(customerId));
  }
  const assigned = Array.isArray(req.crm.assignedCustomerIds) ? req.crm.assignedCustomerIds : [];
  return assigned.includes(String(customerId));
}

