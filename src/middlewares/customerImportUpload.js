import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const csvFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  if (
    ext === ".csv" ||
    mime.includes("csv") ||
    mime === "text/plain" ||
    mime === "application/vnd.ms-excel"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only .csv files are allowed for this import."));
  }
};

const excelFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const ok =
    [".xlsx", ".xls"].includes(ext) ||
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel";
  if (ok) cb(null, true);
  else cb(new Error("Only .xlsx and .xls files are allowed for this import."));
};

export const uploadCustomerImportCsv = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: csvFilter,
}).single("file");

export const uploadCustomerImportExcel = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: excelFilter,
}).single("file");
