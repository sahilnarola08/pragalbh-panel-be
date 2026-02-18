import express from "express";
import targetController from "../controllers/targetController.js";
import {
  validateCreateTarget,
  validateUpdateTarget,
  validateTargetId,
} from "../middlewares/validation/targetValidation.js";

const router = express.Router();

router.post("/", validateCreateTarget, targetController.createTarget);
router.put("/:id", validateTargetId, validateUpdateTarget, targetController.updateTarget);
router.get("/", targetController.getTargets);
router.get("/dashboard-summary", targetController.getDashboardSummary);
router.get("/:id", validateTargetId, targetController.getTargetById);

export default router;
