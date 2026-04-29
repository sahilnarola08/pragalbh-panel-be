import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Employee from "../models/employee.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const employeeUploadDir = path.join(__dirname, "../../uploads/employees");

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const DOC_TYPES = new Set(["ID_PROOF", "ADDRESS_PROOF", "CONTRACT", "BANK", "KYC", "CERTIFICATE", "OTHER"]);
const VERIFICATION_STATUSES = new Set(["PENDING", "VERIFIED", "REJECTED"]);

function inferDocTypeFromName(name) {
  const n = String(name || "").toLowerCase();
  if (/(aadhar|aadhaar|pan|passport|voter|license|licence|id)/.test(n)) return "ID_PROOF";
  if (/(address|electricity|water|rent|bill|residence|residency)/.test(n)) return "ADDRESS_PROOF";
  if (/(offer|appointment|contract|agreement|nda|joining|employment)/.test(n)) return "CONTRACT";
  if (/(bank|cheque|cancelled-cheque|passbook|ifsc|account)/.test(n)) return "BANK";
  if (/(kyc|verification|onboard)/.test(n)) return "KYC";
  if (/(certificate|degree|diploma|training|course)/.test(n)) return "CERTIFICATE";
  return "OTHER";
}

function parseValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function sanitizeDocType(value, fallbackName = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (DOC_TYPES.has(normalized)) return normalized;
  return inferDocTypeFromName(fallbackName);
}

function sanitizeVerificationStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (VERIFICATION_STATUSES.has(normalized)) return normalized;
  return "PENDING";
}

function parseDocumentsJson(raw) {
  if (!raw || typeof raw !== "string") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((d) => d && typeof d.fileUrl === "string" && d.fileUrl.trim())
      .map((d) => ({
        name: String(d.name || "Document").trim().slice(0, 200),
        fileUrl: String(d.fileUrl).trim(),
        docType: sanitizeDocType(d.docType, d.name || "Document"),
        verificationStatus: sanitizeVerificationStatus(d.verificationStatus),
        verifiedAt: d.verifiedAt ? parseValidDate(d.verifiedAt) : null,
        verifiedBy: String(d.verifiedBy || "").trim().slice(0, 120),
        expiryDate: d.expiryDate ? parseValidDate(d.expiryDate) : null,
        notes: String(d.notes || "").trim().slice(0, 600),
        uploadedAt: d.uploadedAt ? parseValidDate(d.uploadedAt) || new Date() : new Date(),
      }));
  } catch {
    return [];
  }
}

function parseNewDocumentsMetaJson(raw) {
  if (!raw || typeof raw !== "string") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((d) => ({
      name: String(d?.name || "").trim().slice(0, 200),
      docType: sanitizeDocType(d?.docType, d?.name || ""),
      verificationStatus: sanitizeVerificationStatus(d?.verificationStatus),
      expiryDate: d?.expiryDate ? parseValidDate(d.expiryDate) : null,
      notes: String(d?.notes || "").trim().slice(0, 600),
    }));
  } catch {
    return [];
  }
}

function filesToDocuments(files, meta = []) {
  if (!Array.isArray(files) || !files.length) return [];
  return files.map((f, i) => {
    const fallbackName = (f.originalname || f.filename || "file").replace(/[<>]/g, "").slice(0, 200);
    const metaDoc = meta[i] || {};
    const verificationStatus = sanitizeVerificationStatus(metaDoc.verificationStatus);
    return {
      name: metaDoc.name || fallbackName,
      fileUrl: `/uploads/employees/${f.filename}`,
      docType: sanitizeDocType(metaDoc.docType, metaDoc.name || fallbackName),
      verificationStatus,
      verifiedAt: verificationStatus === "VERIFIED" ? new Date() : null,
      verifiedBy: verificationStatus === "VERIFIED" ? "Manual" : "",
      expiryDate: parseValidDate(metaDoc.expiryDate),
      notes: String(metaDoc.notes || "").trim().slice(0, 600),
      uploadedAt: new Date(),
    };
  });
}

function computeDocumentStats(documents = []) {
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const stats = {
    total: 0,
    pending: 0,
    verified: 0,
    rejected: 0,
    expired: 0,
    expiringSoon: 0,
  };

  for (const d of documents) {
    stats.total += 1;
    const st = sanitizeVerificationStatus(d?.verificationStatus);
    if (st === "VERIFIED") stats.verified += 1;
    else if (st === "REJECTED") stats.rejected += 1;
    else stats.pending += 1;

    const expiry = parseValidDate(d?.expiryDate);
    if (!expiry) continue;
    if (expiry < now) stats.expired += 1;
    else if (expiry <= in30Days) stats.expiringSoon += 1;
  }

  return stats;
}

function deleteFilesForRemovedDocs(prevDocs, nextDocs) {
  const nextUrls = new Set((nextDocs || []).map((d) => d.fileUrl));
  for (const d of prevDocs || []) {
    if (!d?.fileUrl || !nextUrls.has(d.fileUrl)) {
      try {
        if (d.fileUrl.startsWith("/uploads/employees/")) {
          const fname = path.basename(d.fileUrl);
          const full = path.join(employeeUploadDir, fname);
          if (fs.existsSync(full)) fs.unlinkSync(full);
        }
      } catch (e) {
        console.error("Employee doc file delete:", e.message);
      }
    }
  }
}

export const listEmployees = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const department = (req.query.department || "").trim();
    const status = (req.query.status || "").trim().toUpperCase();

    const filter = { isDeleted: { $ne: true } };
    if (department) {
      filter.department = new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    }
    if (status === "ACTIVE" || status === "INACTIVE") {
      filter.status = status;
    }
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { email: re }, { phone: re }, { role: re }, { department: re }];
    }

    const [items, total] = await Promise.all([
      Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Employee.countDocuments(filter),
    ]);

    const departments = await Employee.distinct("department", { isDeleted: { $ne: true }, department: { $ne: "" } });

    const enrichedItems = (items || []).map((item) => ({
      ...item,
      documentStats: computeDocumentStats(item.documents || []),
    }));

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Employees fetched",
      data: { items: enrichedItems, total, page, limit, departments: departments.filter(Boolean).sort() },
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};

export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Employee.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Employee not found" });
    }
    const documentStats = computeDocumentStats(doc.documents || []);
    return sendSuccessResponse({ res, status: 200, message: "OK", data: { ...doc, documentStats } });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      role,
      department,
      joiningDate,
      salary,
      status,
      documentsJson,
      newDocumentsMetaJson,
    } = req.body;

    if (!name || String(name).trim().length < 2) {
      return sendErrorResponse({ res, status: 400, message: "Name is required (min 2 characters)" });
    }

    const sal = round2(salary);
    if (!Number.isFinite(sal) || sal < 0) {
      return sendErrorResponse({ res, status: 400, message: "Salary must be a non-negative number" });
    }

    const existingDocs = parseDocumentsJson(documentsJson);
    const newDocsMeta = parseNewDocumentsMetaJson(newDocumentsMetaJson);
    const uploadedDocs = filesToDocuments(req.files, newDocsMeta);
    const documents = [...existingDocs, ...uploadedDocs];

    const st = String(status || "ACTIVE").toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const doc = await Employee.create({
      name: String(name).trim(),
      email: String(email || "").trim().toLowerCase(),
      phone: String(phone || "").trim(),
      role: String(role || "").trim(),
      department: String(department || "").trim(),
      joiningDate: joiningDate ? new Date(joiningDate) : null,
      salary: sal,
      status: st,
      documents,
    });

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("employees");
    invalidateCache("salary");
    invalidateCache("dashboard");

    return sendSuccessResponse({ res, status: 201, message: "Employee created", data: doc.toObject() });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Employee.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Employee not found" });
    }

    const {
      name,
      email,
      phone,
      role,
      department,
      joiningDate,
      salary,
      status,
      documentsJson,
      newDocumentsMetaJson,
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim() || String(name).trim().length < 2) {
        return sendErrorResponse({ res, status: 400, message: "Name must be at least 2 characters" });
      }
      doc.name = String(name).trim();
    }
    if (email !== undefined) doc.email = String(email || "").trim().toLowerCase();
    if (phone !== undefined) doc.phone = String(phone || "").trim();
    if (role !== undefined) doc.role = String(role || "").trim();
    if (department !== undefined) doc.department = String(department || "").trim();
    if (joiningDate !== undefined) doc.joiningDate = joiningDate ? new Date(joiningDate) : null;
    if (salary !== undefined) {
      const sal = round2(salary);
      if (!Number.isFinite(sal) || sal < 0) {
        return sendErrorResponse({ res, status: 400, message: "Salary must be a non-negative number" });
      }
      doc.salary = sal;
    }
    if (status !== undefined) {
      const st = String(status).toUpperCase();
      doc.status = st === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    }

    const prevDocs = doc.documents || [];
    const fromJson = documentsJson !== undefined ? parseDocumentsJson(documentsJson) : null;
    const newDocsMeta = parseNewDocumentsMetaJson(newDocumentsMetaJson);
    const uploaded = filesToDocuments(req.files, newDocsMeta);
    if (fromJson !== null) {
      deleteFilesForRemovedDocs(prevDocs, [...fromJson, ...uploaded]);
      doc.documents = [...fromJson, ...uploaded];
    } else if (uploaded.length) {
      doc.documents = [...(doc.documents || []), ...uploaded];
    }

    await doc.save();

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("employees");
    invalidateCache("salary");
    invalidateCache("dashboard");

    return sendSuccessResponse({ res, status: 200, message: "Employee updated", data: doc.toObject() });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Employee.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) {
      return sendErrorResponse({ res, status: 404, message: "Employee not found" });
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.status = "INACTIVE";
    await doc.save();

    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache("employees");
    invalidateCache("salary");
    invalidateCache("dashboard");

    return sendSuccessResponse({ res, status: 200, message: "Employee deleted", data: { id: doc._id } });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};
