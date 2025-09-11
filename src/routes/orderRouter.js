import express from "express";
import orderController from "../controllers/orderController.js";


const router = express.Router();

// create order
router.post("/create",orderController.createOrder);

// get all orders
router.get("/all",orderController.getAllOrders);

export default router;