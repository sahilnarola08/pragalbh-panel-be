import express from "express";
import productController from "../controllers/productController.js";
import validateProductSchema, { validateProductUpdate, validateProductDelete } from "../middlewares/validation/productValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/create", authorize("product.create"), validateProductSchema, productController.createProduct);
router.get("/all", authorize("product.view"), productController.getAllProducts);
router.get("/product-by-id/:id", authorize("product.view"), validateProductDelete, productController.getProductById);
router.put("/update-product/:id", authorize("product.edit"), validateProductUpdate, productController.updateProduct);
router.delete("/delete-product/:id", authorize("product.delete"), validateProductDelete, productController.deleteProduct);

export default router;
