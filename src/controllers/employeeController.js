import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Employee from "../models/employee.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const employeeUploadDir = path.join(__dirname, "../../uploads/employees");

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

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
        uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
      }));
  } catch {
    return [];
  }
}

function filesToDocuments(files) {
  if (!Array.isArray(files) || !files.length) return [];
  return files.map((f) => ({
    name: (f.originalname || f.filename || "file").replace(/[<>]/g, "").slice(0, 200),
    fileUrl: `/uploads/employees/${f.filename}`,
    uploadedAt: new Date(),
  }));
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

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Employees fetched",
      data: { items, total, page, limit, departments: departments.filter(Boolean).sort() },
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
    return sendSuccessResponse({ res, status: 200, message: "OK", data: doc });
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
    } = req.body;

    if (!name || String(name).trim().length < 2) {
      return sendErrorResponse({ res, status: 400, message: "Name is required (min 2 characters)" });
    }

    const sal = round2(salary);
    if (!Number.isFinite(sal) || sal < 0) {
      return sendErrorResponse({ res, status: 400, message: "Salary must be a non-negative number" });
    }

    const existingDocs = parseDocumentsJson(documentsJson);
    const uploadedDocs = filesToDocuments(req.files);
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
    const uploaded = filesToDocuments(req.files);
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
