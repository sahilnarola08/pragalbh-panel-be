import multer from "multer";
import path from "path";
import { deleteVideoFile, saveVideoBuffer } from "../services/storage/storageService.js";

const supportedVideo = /\.(mp4|webm|mov|avi|mkv)$/i;

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (supportedVideo.test(extension)) {
    cb(null, true);
  } else {
    cb(new Error("Only mp4, webm, mov, avi, and mkv video formats are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
  },
});

const sanitizeName = (originalname) => {
  const ext = path.extname(originalname).toLowerCase();
  const name = path.basename(originalname, ext);
  return name.replace(/[^a-zA-Z0-9]/g, "-");
};

const saveVideo = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
  const uniqueSuffix = Date.now();
  const sanitized = sanitizeName(file.originalname);
  const filename = `${uniqueSuffix}-${sanitized}${ext}`;
  const saved = await saveVideoBuffer({
    buffer: file.buffer,
    filename,
    mimetype: file.mimetype,
  });

  return {
    filename: saved.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    videoUrl: saved.videoUrl,
  };
};

export const uploadProductVideos = upload.array("videos", 3);

export const processVideos = async (req, res, next) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return next(new Error("No videos uploaded"));
    }

    if (files.length > 3) {
      return next(new Error("Maximum 3 videos can be uploaded."));
    }

    req.processedVideos = await Promise.all(files.map((file) => saveVideo(file)));
    next();
  } catch (error) {
    next(error);
  }
};

export { deleteVideoFile };
