import express from "express";
import * as roleController from "../controllers/roleController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.use(authorize("roles.manage"));

router.get("/", roleController.getRoles);
router.post("/", roleController.createRole);
router.put("/:id", roleController.updateRole);
router.delete("/:id", roleController.deleteRole);

export default router;
