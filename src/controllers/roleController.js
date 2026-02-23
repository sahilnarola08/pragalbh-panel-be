import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as roleService from "../services/roleService.js";
import { logAudit } from "../services/auditService.js";

export async function getRoles(req, res, next) {
  try {
    const list = await roleService.listRoles();
    sendSuccessResponse({ res, data: list, message: "Roles fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function createRole(req, res, next) {
  try {
    const role = await roleService.createRole(req.body, req);
    await logAudit(req, "ROLE_CREATE", "roles", { roleId: role._id, name: role.name });
    sendSuccessResponse({ res, data: role, message: "Role created", status: 201 });
  } catch (e) {
    next(e);
  }
}

export async function updateRole(req, res, next) {
  try {
    const role = await roleService.updateRole(req.params.id, req.body, req);
    if (!role) return sendErrorResponse({ status: 404, res, message: "Role not found" });
    await logAudit(req, "ROLE_UPDATE", "roles", { roleId: role._id, name: role.name });
    sendSuccessResponse({ res, data: role, message: "Role updated", status: 200 });
  } catch (e) {
    if (e.status) return sendErrorResponse({ status: e.status, res, message: e.message });
    next(e);
  }
}

export async function deleteRole(req, res, next) {
  try {
    const result = await roleService.deleteRole(req.params.id, req);
    if (!result) return sendErrorResponse({ status: 404, res, message: "Role not found" });
    await logAudit(req, "ROLE_DELETE", "roles", { roleId: req.params.id });
    sendSuccessResponse({ res, data: { deleted: true }, message: "Role deleted", status: 200 });
  } catch (e) {
    if (e.status) return sendErrorResponse({ status: e.status, res, message: e.message });
    next(e);
  }
}
