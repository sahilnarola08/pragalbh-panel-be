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
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/images", authorize("upload.manage"), uploadImagesMiddleware, processImages, uploadProductImages);
router.delete("/image", authorize("upload.manage"), deleteUploadedImage);

export default router;
