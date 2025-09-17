import express from "express";
import orderController from "../controllers/orderController.js";


const router = express.Router();

// create order
router.post("/create", orderController.createOrder);

// get all orders
router.get("/all", orderController.getAllOrders);

// update order status
router.patch("/update-status", orderController.updateOrderStatus);

// update order checklist
router.patch("/update-checklist", orderController.updateOrderChecklist);

// get kanban board data
router.get("/kanban-board", orderController.getKanbanData);

export default router;
