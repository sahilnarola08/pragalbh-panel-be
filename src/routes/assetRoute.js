import express from "express";
import * as assetController from "../controllers/assetController.js";
import {
  validateAssetId,
  validateCreateAsset,
  validateUpdateAsset,
  validateOwnershipChange,
  validateValueUpdate,
} from "../middlewares/validation/assetValidation.js";

const router = express.Router();

// Analytics
router.get("/analytics/ownership", assetController.ownershipDistribution);
router.get("/analytics/contributions", assetController.contributionSummary);

// List / Create
router.get("/", assetController.listAssets);
router.post("/", validateCreateAsset, assetController.createAsset);

// Detail
router.get("/:id", validateAssetId, assetController.getAsset);
router.put("/:id", validateUpdateAsset, assetController.updateAsset);
router.delete("/:id", validateAssetId, assetController.deleteAsset);

// Actions
router.post("/:id/ownership", validateOwnershipChange, assetController.changeOwnership);
router.post("/:id/value", validateValueUpdate, assetController.updateValue);
router.get("/:id/history", validateAssetId, assetController.getHistory);

export default router;

