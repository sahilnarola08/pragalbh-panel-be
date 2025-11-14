import express from "express";
import {
  uploadProductImages,
  deleteUploadedImage,
} from "../controllers/uploadController.js";
import {
  uploadProductImages as uploadImagesMiddleware,
  processImages,
} from "../middlewares/upload.js";

const router = express.Router();

// Upload between 1 and 5 images
router.post("/images", uploadImagesMiddleware, processImages, uploadProductImages);

// Delete uploaded image
router.delete("/image", deleteUploadedImage);

export default router;
