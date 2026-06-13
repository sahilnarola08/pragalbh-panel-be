import express from "express";
import {
  uploadProductImages,
  deleteUploadedImage,
  uploadProductVideos,
  deleteUploadedVideo,
} from "../controllers/uploadController.js";
import {
  uploadProductImages as uploadImagesMiddleware,
  processImages,
} from "../middlewares/upload.js";
import {
  uploadProductVideos as uploadVideosMiddleware,
  processVideos,
} from "../middlewares/videoUpload.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
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
router.post(
  "/videos",
  authorizeAny(["upload.manage", "orders.create", "orders.edit", "order_management.edit"]),
  uploadVideosMiddleware,
  processVideos,
  uploadProductVideos
);
router.delete(
  "/video",
  authorizeAny(["upload.manage", "orders.create", "orders.edit", "order_management.edit"]),
  deleteUploadedVideo
);

export default router;
