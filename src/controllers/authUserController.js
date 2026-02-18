import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as authUserService from "../services/authUserService.js";
import { logAudit } from "../services/auditService.js";

export async function getUsers(req, res, next) {
  try {
    const list = await authUserService.listUsers();
    sendSuccessResponse({ res, data: list, message: "Users fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = await authUserService.createUser(req.body, req);
    await logAudit(req, "USER_CREATE", "users", { userId: user._id, email: user.email });
    const out = user.toJSON ? user.toJSON() : user;
    sendSuccessResponse({ res, data: out, message: "User created", status: 201 });
  } catch (e) {
    if (e.status) return sendErrorResponse({ status: e.status, res, message: e.message });
    next(e);
  }
}

export async function updateUser(req, res, next) {
  try {
    const user = await authUserService.updateUser(req.params.id, req.body, req);
    if (!user) return sendErrorResponse({ status: 404, res, message: "User not found" });
    await logAudit(req, "USER_UPDATE", "users", { userId: user._id });
    const out = user.toJSON ? user.toJSON() : user;
    sendSuccessResponse({ res, data: out, message: "User updated", status: 200 });
  } catch (e) {
    if (e.status) return sendErrorResponse({ status: e.status, res, message: e.message });
    next(e);
  }
}

export async function setUserRole(req, res, next) {
  try {
    const user = await authUserService.setUserRole(req.params.id, req.body.roleId, req);
    if (!user) return sendErrorResponse({ status: 404, res, message: "User not found" });
    await logAudit(req, "USER_ROLE_UPDATE", "users", { userId: user._id, roleId: req.body.roleId });
    sendSuccessResponse({ res, data: user, message: "Role assigned", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function setUserPermissions(req, res, next) {
  try {
    const user = await authUserService.setUserPermissions(req.params.id, req.body.customPermissions, req);
    if (!user) return sendErrorResponse({ status: 404, res, message: "User not found" });
    await logAudit(req, "USER_PERMISSIONS_UPDATE", "users", { userId: user._id });
    sendSuccessResponse({ res, data: user, message: "Permissions updated", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function getUserById(req, res, next) {
  try {
    const user = await authUserService.getUserById(req.params.id);
    if (!user) return sendErrorResponse({ status: 404, res, message: "User not found" });
    sendSuccessResponse({ res, data: user, message: "User fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}
