import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as columnPermissionService from "../services/columnPermissionService.js";

/**
 * GET /permissions/columns
 * Params: module, table, role (optional - for admin; if omitted uses current user's role)
 * Returns: { visibleColumns: string[] | null }
 * null = no restrictions, show all columns
 */
export async function getVisibleColumns(req, res, next) {
  try {
    const { module: moduleName, table: tableName, role: roleIdParam } = req.query;
    if (!moduleName || !tableName) {
      return sendErrorResponse({ status: 400, res, message: "module and table are required" });
    }

    let roleId = roleIdParam || req.user?.roleId?._id || req.user?.roleId;
    if (!roleId) {
      return sendSuccessResponse({ res, data: { visibleColumns: null }, message: "No role", status: 200 });
    }

    const visibleColumns = await columnPermissionService.getVisibleColumns(
      roleId,
      moduleName,
      tableName
    );
    // Prevent browser/CDN from caching so column permission changes reflect immediately
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    sendSuccessResponse({
      res,
      data: { visibleColumns },
      message: "Visible columns fetched",
      status: 200,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /permissions/columns/admin
 * For admin UI: get column permissions for a specific role.
 * Params: module, table, role
 */
export async function getColumnPermissionsForRole(req, res, next) {
  try {
    const { module: moduleName, table: tableName, role: roleId } = req.query;
    if (!moduleName || !tableName || !roleId) {
      return sendErrorResponse({ status: 400, res, message: "module, table, and role are required" });
    }

    const result = await columnPermissionService.getColumnPermissionsForRole(
      roleId,
      moduleName,
      tableName
    );
    sendSuccessResponse({
      res,
      data: result,
      message: "Column permissions fetched",
      status: 200,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /permissions/columns/definitions
 * Returns module/table definitions for admin dropdowns.
 */
export async function getModuleTableDefinitions(req, res, next) {
  try {
    const definitions = columnPermissionService.getModuleTableDefinitions();
    sendSuccessResponse({
      res,
      data: definitions,
      message: "Definitions fetched",
      status: 200,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * PUT /permissions/columns
 * Body: { roleId, moduleName, tableName, columnVisibility: { columnId: boolean } }
 */
export async function saveColumnPermissions(req, res, next) {
  try {
    const { roleId, moduleName, tableName, columnVisibility } = req.body;
    if (!roleId || !moduleName || !tableName || !columnVisibility || typeof columnVisibility !== "object") {
      return sendErrorResponse({
        status: 400,
        res,
        message: "roleId, moduleName, tableName, and columnVisibility are required",
      });
    }

    const visibleColumns = await columnPermissionService.saveColumnPermissions(
      roleId,
      moduleName,
      tableName,
      columnVisibility
    );
    sendSuccessResponse({
      res,
      data: { visibleColumns },
      message: "Column permissions saved",
      status: 200,
    });
  } catch (e) {
    if (e.message?.includes("Unknown module/table")) {
      return sendErrorResponse({ status: 400, res, message: e.message });
    }
    next(e);
  }
}
