import express from "express";
import {
  uploadProductImages,
  deleteUploadedImage,
} from "../controllers/uploadController.js";
import {
  uploadProductImages as uploadImagesMiddleware,
  processImages,
} from "../middlewares/upload.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();

const allowMigrationUploadKey = (req, res, next) => {
  const configuredKey = String(process.env.MIGRATION_UPLOAD_KEY || "").trim();
  if (!configuredKey) {
    return res.status(503).json({
      success: false,
      message: "Migration upload key is not configured.",
      status: 503,
      data: null,
    });
  }

  const providedKey = String(req.headers["x-migration-key"] || "").trim();
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid migration upload key.",
      status: 401,
      data: null,
    });
  }

  next();
};

// Temporary migration endpoint: allows bulk media migration without JWT.
// Guarded by MIGRATION_UPLOAD_KEY header.
router.post(
  "/images/migrate",
  allowMigrationUploadKey,
  uploadImagesMiddleware,
  processImages,
  uploadProductImages
);

router.use(authenticateJWT);

// Add/Edit Order flow uploads product images via this endpoint.
router.post(
  "/images",
  authorizeAny(["upload.manage", "orders.create", "orders.edit", "order_management.edit"]),
  uploadImagesMiddleware,
  processImages,
  uploadProductImages
);
router.delete(
  "/image",
  authorizeAny(["upload.manage", "orders.create", "orders.edit", "order_management.edit"]),
  deleteUploadedImage
);

export default router;
