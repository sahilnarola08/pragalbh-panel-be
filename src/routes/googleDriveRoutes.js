import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import * as googleDriveController from "../controllers/googleDriveController.js";

const router = express.Router();

router.get("/auth", authenticateJWT, googleDriveController.getAuthUrl);
router.get("/callback", googleDriveController.callback);
router.post("/set-folder", authenticateJWT, googleDriveController.setFolder);
router.get("/status", authenticateJWT, googleDriveController.status);

export default router;
