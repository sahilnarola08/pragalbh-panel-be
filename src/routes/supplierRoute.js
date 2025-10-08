import express from "express";
import { validateSupplierSchema, validateSupplierUpdate, validateSupplierDelete } from "../middlewares/validation/supplierSchema.js";
import supplierController from "../controllers/supplierController.js";

const router = express.Router();

// Create supplier
router.post("/create", validateSupplierSchema, supplierController.createSupplier);

// Get all suppliers
router.get("/all", supplierController.getAllSuppliers);

// Get supplier by ID
router.get("/get-supplier-by-id/:id", validateSupplierDelete, supplierController.getSupplierById);

// Update supplier by ID
router.put("/update-supplier/:id", validateSupplierUpdate, supplierController.updateSupplier);

// Delete supplier by ID
router.delete("/delete-supplier/:id", validateSupplierDelete, supplierController.deleteSupplier);


// update supplier advance payment
router.put("/update-balance", supplierController.updateSupplierBalance);

export default router;