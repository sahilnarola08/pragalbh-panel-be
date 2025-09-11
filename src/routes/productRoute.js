import express from "express";
import productController from "../controllers/productController.js";



const router = express.Router();

// POST /api/products/create
router.post("/create", productController.createProduct);

// get all products
router.get("/all", productController.getAllProducts);


export default router;
