import express from "express";
import productController from "../controllers/productController.js";
import validateProductSchema, { validateProductUpdate, validateProductDelete } from "../middlewares/validation/productValidation.js";

const router = express.Router();

// Create product
router.post("/create", validateProductSchema, productController.createProduct);

// Get all products
router.get("/all", productController.getAllProducts);

// Get product by ID
router.get("/product-by-id/:id", validateProductDelete, productController.getProductById);

// Update product by ID
router.put("/update-product/:id", validateProductUpdate, productController.updateProduct);

// Delete product by ID
router.delete("/delete-product/:id", validateProductDelete, productController.deleteProduct);

export default router;
