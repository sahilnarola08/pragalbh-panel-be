import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { runBackup } from "../services/runBackupService.js";
import { sendErrorResponse, sendSuccessResponse } from "../util/commonResponses.js";

const router = express.Router();

router.post("/run", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendErrorResponse({ res, status: 401, message: "Unauthorized" });
    const result = await runBackup(userId);
    return sendSuccessResponse({
      res,
      data: result,
      message: "Backup completed and uploaded to Google Drive",
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e?.message || "Backup failed" });
  }
});

export default router;
