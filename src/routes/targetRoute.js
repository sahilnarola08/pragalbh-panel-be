import express from "express";
import targetController from "../controllers/targetController.js";
import {
  validateCreateTarget,
  validateUpdateTarget,
  validateTargetId,
} from "../middlewares/validation/targetValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/", authorize("targets.create"), validateCreateTarget, targetController.createTarget);
router.put("/:id", authorize("targets.edit"), validateTargetId, validateUpdateTarget, targetController.updateTarget);
router.get("/", authorize("targets.view"), targetController.getTargets);
router.get("/dashboard-summary", authorize("targets.view"), targetController.getDashboardSummary);
router.get("/:id", authorize("targets.view"), validateTargetId, targetController.getTargetById);

export default router;
