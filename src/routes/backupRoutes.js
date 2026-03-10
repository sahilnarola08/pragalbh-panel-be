import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import * as backupController from "../controllers/backupController.js";

const router = express.Router();

router.use(authenticateJWT);
router.use(requireSuperAdmin);

router.post("/run", backupController.runBackup);
router.get("/history", backupController.history);
router.get("/download/:id", backupController.download);
router.post("/restore/:id", backupController.restore);
router.delete("/delete/:id", backupController.deleteBackup);

export default router;

