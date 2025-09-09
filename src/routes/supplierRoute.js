import express from "express";
import validateSupplierSchema from "../middlewares/validation/supplierSchema.js";
import supplierController from "../controllers/supplierController.js";

const router = express.Router();

router.post("/create", validateSupplierSchema,supplierController.createSupplier );

export default router;