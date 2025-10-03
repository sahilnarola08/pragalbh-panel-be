import express from "express";
import orderController from "../controllers/orderController.js";
import { orderValidationSchema, validateOrderUpdate, validateOrderDelete } from "../middlewares/validation/orderValidation.js";
import { validateUpdateInitialPayment } from "../middlewares/validation/updateInitialPayment.js";

const router = express.Router();

// Create order
router.post("/create", orderValidationSchema, orderController.createOrder);

// Get all orders
router.get("/all", orderController.getAllOrders);

// Get order by ID
router.get("/get-order-by-id/:id", validateOrderDelete, orderController.getOrderById);

// Update order by ID
router.put("/update-order/:id", validateOrderUpdate, orderController.updateOrder);

// Delete order by ID
router.delete("/delete-order/:id", validateOrderDelete, orderController.deleteOrder);

// Update order status
router.patch("/update-status", orderController.updateOrderStatus);

// Update order checklist
router.patch("/update-checklist", orderController.updateOrderChecklist);

// Get kanban board data
router.get("/kanban-board", orderController.getKanbanData);

// Update tracking info
router.patch("/update-tracking-info", orderController.updateTrackingInfo);

// Update initial payment
router.patch("/update-initial-payment", validateUpdateInitialPayment, orderController.updateInitialPayment);

export default router;
    