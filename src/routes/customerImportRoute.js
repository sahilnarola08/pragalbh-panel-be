/**
 * Optional REST-style paths (spec-friendly): POST /customers/import/csv|excel|google-sheet
 * Mirrors /user/import/customers/* handlers.
 */
import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";
import customerImportController from "../controllers/customerImportController.js";
import {
  uploadCustomerImportCsv,
  uploadCustomerImportExcel,
} from "../middlewares/customerImportUpload.js";

const router = express.Router();
router.use(authenticateJWT);

router.post(
  "/import/csv",
  authorize("user.create"),
  uploadCustomerImportCsv,
  customerImportController.importCsv
);
router.post(
  "/import/excel",
  authorize("user.create"),
  uploadCustomerImportExcel,
  customerImportController.importExcel
);
router.post(
  "/import/google-sheet",
  authorize("user.create"),
  customerImportController.importGoogleSheet
);

export default router;
