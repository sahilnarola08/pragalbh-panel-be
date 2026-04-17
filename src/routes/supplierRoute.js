import express from "express";
import { validateSupplierSchema, validateSupplierUpdate, validateSupplierDelete } from "../middlewares/validation/supplierSchema.js";
import supplierController from "../controllers/supplierController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/create", authorize("supplier.create"), validateSupplierSchema, supplierController.createSupplier);
// Add/Edit Order supplier dropdown must load for production/order users.
router.get(
  "/all",
  authorizeAny(["supplier.view", "orders.create", "orders.edit", "order_management.view"]),
  supplierController.getAllSuppliers
);
router.get(
  "/get-supplier-by-id/:id",
  authorizeAny(["supplier.view", "orders.create", "orders.edit", "order_management.view"]),
  validateSupplierDelete,
  supplierController.getSupplierById
);
router.put("/update-supplier/:id", authorize("supplier.edit"), validateSupplierUpdate, supplierController.updateSupplier);
router.delete("/delete-supplier/:id", authorize("supplier.delete"), validateSupplierDelete, supplierController.deleteSupplier);
router.put("/update-balance", authorize("supplier.edit"), supplierController.updateSupplierBalance);

export default router;