import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";
import { getStorageUsage } from "../controllers/storageSettingsController.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/usage", authorize("settings.manage"), getStorageUsage);

export default router;
