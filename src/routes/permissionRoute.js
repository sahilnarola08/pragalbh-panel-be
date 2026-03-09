import express from "express";
import * as permissionController from "../controllers/permissionController.js";
import * as columnPermissionController from "../controllers/columnPermissionController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", permissionController.getPermissions);
router.get("/grouped", permissionController.getPermissionsGrouped);
router.post("/", authorize("roles.manage"), permissionController.createPermission);

// Column-level permissions (must be before /columns to avoid conflict)
router.get("/columns/definitions", authorize("roles.manage"), columnPermissionController.getModuleTableDefinitions);
router.get("/columns/admin", authorize("roles.manage"), columnPermissionController.getColumnPermissionsForRole);
router.put("/columns", authorize("roles.manage"), columnPermissionController.saveColumnPermissions);
router.get("/columns", columnPermissionController.getVisibleColumns);

export default router;
