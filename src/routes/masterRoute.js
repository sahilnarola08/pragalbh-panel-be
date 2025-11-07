import express from "express";
import masterController from "../controllers/masterController.js";

const router = express.Router();

// ==================== Master Routes ====================
// Create master - accepts single object
router.post("/create", masterController.createMaster);

// Get all masters with filtering, search, and pagination
router.get("/get", masterController.getAllMasters);

// Get master by ID
router.get("/get-by-id/:id", masterController.getMasterById);

// Update master by ID
router.put("/update/:id", masterController.updateMaster);

// Delete master by ID (soft delete)
router.delete("/delete/:id", masterController.deleteMaster);

// ==================== Master Assets Routes ====================
// Create master asset
router.post("/assets/create", masterController.createMasterAsset);

// Get all master assets sorted alphabetically
router.get("/assets/get", masterController.getAllMasterAssets);

// Get master asset by ID
router.get("/assets/get-by-id/:id", masterController.getMasterAssetById);

// Update master asset by ID
router.put("/assets/update/:id", masterController.updateMasterAsset);

// Delete master asset by ID (soft delete)
router.delete("/assets/delete/:id", masterController.deleteMasterAsset);


export default router;

