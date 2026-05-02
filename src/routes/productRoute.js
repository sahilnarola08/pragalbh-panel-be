import express from "express";
import productController from "../controllers/productController.js";
import validateProductSchema, { validateProductUpdate, validateProductDelete } from "../middlewares/validation/productValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/create", authorize("product.create"), validateProductSchema, productController.createProduct);
// Add/Edit Order product search should work for production/order users.
router.get(
  "/all",
  authorizeAny(["product.view", "orders.create", "orders.edit", "order_management.view"]),
  productController.getAllProducts
);
router.get(
  "/product-by-id/:id",
  authorizeAny(["product.view", "orders.create", "orders.edit", "order_management.view"]),
  validateProductDelete,
  productController.getProductById
);
router.put("/update-product/:id", authorize("product.edit"), validateProductUpdate, productController.updateProduct);
router.delete("/delete-product/:id", authorize("product.delete"), validateProductDelete, productController.deleteProduct);
router.post("/bulk-delete-products", authorize("product.delete"), productController.bulkDeleteProducts);

export default router;
