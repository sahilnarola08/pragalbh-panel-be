import express from "express";
import * as permissionController from "../controllers/permissionController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", permissionController.getPermissions);
router.get("/grouped", permissionController.getPermissionsGrouped);
router.post("/", authorize("roles.manage"), permissionController.createPermission);

export default router;
