import multer from "multer";
import path from "path";
import sharp from "sharp";
import { deleteImageFile, getImageUrl, saveImageBuffer } from "../services/storage/storageService.js";

const supportedImage = /png|jpg|jpeg|webp|gif/;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (supportedImage.test(extension)) {
    cb(null, true);
  } else {
    cb(new Error("Only png, jpg, jpeg, gif, and webp formats are allowed."));
  }
};

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — sharp compresses to webp after upload

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_IMAGE_UPLOAD_BYTES,
  },
});

const sanitizeName = (originalname) => {
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext);
  return name.replace(/[^a-zA-Z0-9]/g, "-");
};

const convertAndSaveImage = async (buffer, originalname) => {
  const uniqueSuffix = Date.now();
  const sanitized = sanitizeName(originalname);
  const filename = `${uniqueSuffix}-${sanitized}.webp`;
  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const saved = await saveImageBuffer({ buffer: webpBuffer, filename });

  return {
    filename: saved.filename,
    imageUrl: saved.imageUrl,
    outputPath: saved.outputPath,
  };
};

export const uploadProductImages = upload.array("images", 5);

export const processImages = async (req, res, next) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return next(new Error("No files uploaded"));
    }

    if (files.length > 5) {
      return next(new Error("Maximum 5 images can be uploaded."));
    }

    const processed = await Promise.all(
      files.map(async (file) => {
        const { filename, imageUrl } = await convertAndSaveImage(
          file.buffer,
          file.originalname
        );

        return {
          filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          imageUrl,
        };
      })
    );

    req.processedImages = processed;
    next();
  } catch (error) {
    next(error);
  }
};

export { getImageUrl, deleteImageFile, MAX_IMAGE_UPLOAD_BYTES };
