import express from "express";
import { createProduct } from "../controllers/productController.js";

const router = express.Router();

// POST /api/products/create
router.post("/create", createProduct);

export default router;
