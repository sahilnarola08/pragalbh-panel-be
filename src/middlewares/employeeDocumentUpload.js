import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const employeeUploadDir = path.join(__dirname, "../../uploads/employees");

if (!fs.existsSync(employeeUploadDir)) {
  fs.mkdirSync(employeeUploadDir, { recursive: true });
}

const allowedExt = /\.(pdf|png|jpe?g|webp|gif|doc|docx)$/i;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, employeeUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${base}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const name = file.originalname || "";
  if (allowedExt.test(name)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, images (png/jpg/jpeg/webp/gif), and Word docs (doc/docx) are allowed."));
  }
};

export const uploadEmployeeDocuments = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 15,
  },
}).array("documents", 15);
