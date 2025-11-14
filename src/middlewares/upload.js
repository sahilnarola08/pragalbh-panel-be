import fs from "fs";
import multer from "multer";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const supportedImage = /png|jpg|jpeg|webp|gif/;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imageUploadDir = path.join(__dirname, "../../uploads/images");

if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (supportedImage.test(extension)) {
    cb(null, true);
  } else {
    cb(new Error("Only png, jpg, jpeg, gif, and webp formats are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB per file
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
  const outputPath = path.join(imageUploadDir, filename);

  await sharp(buffer).webp({ quality: 80 }).toFile(outputPath);

  return {
    filename,
    imageUrl: `/images/${filename}`,
    outputPath,
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

export const getImageUrl = (filename) => {
  if (!filename) return null;
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return filename;
  }
  if (filename.startsWith("/uploads/images/")) {
    return filename.replace("/uploads/images/", "/images/");
  }
  if (filename.startsWith("/images/")) {
    return filename;
  }
  return `/images/${filename}`;
};

export const deleteImageFile = (imagePath) => {
  try {
    if (!imagePath) return;

    let filename;
    if (imagePath.includes("/uploads/images/")) {
      filename = imagePath.split("/uploads/images/")[1];
    } else if (imagePath.includes("/images/")) {
      filename = imagePath.split("/images/")[1];
    } else if (path.isAbsolute(imagePath)) {
      filename = path.basename(imagePath);
    } else {
      filename = imagePath;
    }

    if (!filename) return;

    const filePath = path.join(imageUploadDir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Error deleting image file:", error.message);
  }
};

