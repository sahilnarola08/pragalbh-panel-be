import express from "express";
import * as authUserController from "../controllers/authUserController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.use(authorize("users.manage"));

router.get("/", authUserController.getUsers);
router.post("/", authUserController.createUser);
router.get("/:id", authUserController.getUserById);
router.put("/:id", authUserController.updateUser);
router.put("/:id/role", authUserController.setUserRole);
router.put("/:id/permissions", authUserController.setUserPermissions);
router.put("/:id/crm-access", authorize("crm.access.manage"), authUserController.setUserCrmAccess);
router.post("/:id/crm-invite", authorize("crm.access.manage"), authUserController.inviteUserToCrm);

export default router;
