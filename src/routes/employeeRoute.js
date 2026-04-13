import express from "express";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controllers/employeeController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";
import { uploadEmployeeDocuments } from "../middlewares/employeeDocumentUpload.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", authorize("employees.view"), listEmployees);
router.get("/:id", authorize("employees.view"), getEmployeeById);
router.post(
  "/",
  authorize("employees.create"),
  uploadEmployeeDocuments,
  createEmployee
);
router.put(
  "/:id",
  authorize("employees.edit"),
  uploadEmployeeDocuments,
  updateEmployee
);
router.delete("/:id", authorize("employees.delete"), deleteEmployee);

export default router;
