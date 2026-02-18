import express from "express";
import * as assetController from "../controllers/assetController.js";
import {
  validateAssetId,
  validateCreateAsset,
  validateUpdateAsset,
  validateOwnershipChange,
  validateValueUpdate,
} from "../middlewares/validation/assetValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/analytics/ownership", authorize("assets.view"), assetController.ownershipDistribution);
router.get("/analytics/contributions", authorize("assets.view"), assetController.contributionSummary);
router.get("/", authorize("assets.view"), assetController.listAssets);
router.post("/", authorize("assets.create"), validateCreateAsset, assetController.createAsset);
router.get("/:id", authorize("assets.view"), validateAssetId, assetController.getAsset);
router.put("/:id", authorize("assets.edit"), validateUpdateAsset, assetController.updateAsset);
router.delete("/:id", authorize("assets.delete"), validateAssetId, assetController.deleteAsset);
router.post("/:id/ownership", authorize("assets.change_ownership"), validateOwnershipChange, assetController.changeOwnership);
router.post("/:id/value", authorize("assets.edit"), validateValueUpdate, assetController.updateValue);
router.get("/:id/history", authorize("assets.view_history"), validateAssetId, assetController.getHistory);

export default router;

