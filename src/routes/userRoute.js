import express from "express";
import userController from "../controllers/userController.js";
import customerImportController from "../controllers/customerImportController.js";
import {
  uploadCustomerImportCsv,
  uploadCustomerImportExcel,
} from "../middlewares/customerImportUpload.js";
import { 
  validateUserRegistration, 
  validateUserUpdate, 
  validateUserDelete 
} from "../middlewares/validation/userValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

/** Customer bulk import (CSV / Excel / Google Sheets) — same permission as create customer */
router.post(
  "/import/customers/csv",
  authorize("user.create"),
  uploadCustomerImportCsv,
  customerImportController.importCsv
);
router.post(
  "/import/customers/excel",
  authorize("user.create"),
  uploadCustomerImportExcel,
  customerImportController.importExcel
);
router.post(
  "/import/customers/google-sheet",
  authorize("user.create"),
  customerImportController.importGoogleSheet
);

router.post("/registration", authorize("user.create"), validateUserRegistration, userController.register);
router.get("/users-data", authorize("user.view"), userController.getAllUsers);
router.get("/user-data-by-id/:id", authorize("user.view"), validateUserDelete, userController.getUserById);
router.put("/user-update/:id", authorize("user.edit"), validateUserUpdate, userController.updateUser);
router.delete("/user-delete/:id", authorize("user.delete"), validateUserDelete, userController.deleteUser);

export default router;