import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as permissionService from "../services/permissionService.js";

export async function getPermissions(req, res, next) {
  try {
    const list = await permissionService.listPermissions();
    sendSuccessResponse({ res, data: list, message: "Permissions fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function getPermissionsGrouped(req, res, next) {
  try {
    const grouped = await permissionService.listPermissionsGroupedByModule();
    sendSuccessResponse({ res, data: grouped, message: "Permissions fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function createPermission(req, res, next) {
  try {
    const perm = await permissionService.createPermission(req.body);
    sendSuccessResponse({ res, data: perm, message: "Permission created", status: 201 });
  } catch (e) {
    if (e.code === 11000) return sendErrorResponse({ status: 400, res, message: "Permission name already exists" });
    next(e);
  }
}
