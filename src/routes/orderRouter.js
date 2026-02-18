import express from "express";
import orderController from "../controllers/orderController.js";
import { orderValidationSchema, validateOrderUpdate, validateOrderDelete } from "../middlewares/validation/orderValidation.js";
import { validateUpdateInitialPayment } from "../middlewares/validation/updateInitialPayment.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/create", authorize("orders.create"), orderValidationSchema, orderController.createOrder);
router.get("/all", authorize("orders.view"), orderController.getAllOrders);
router.get("/get-order-by-id/:id", authorize("orders.view"), validateOrderDelete, orderController.getOrderById);
router.put("/update-order/:id", authorize("orders.edit"), validateOrderUpdate, orderController.updateOrder);
router.delete("/delete-order/:id", authorize("orders.delete"), validateOrderDelete, orderController.deleteOrder);
router.patch("/update-status", authorizeAny(["orders.approve", "order_management.edit"]), orderController.updateOrderStatus);
router.patch("/update-checklist", authorizeAny(["orders.edit", "order_management.edit"]), orderController.updateOrderChecklist);
router.get("/kanban-board", authorizeAny(["orders.view", "order_management.view"]), orderController.getKanbanData);
router.patch("/update-tracking-info", authorizeAny(["orders.edit", "order_management.edit"]), orderController.updateTrackingInfo);
router.patch("/update-initial-payment", authorizeAny(["orders.edit", "order_management.edit"]), validateUpdateInitialPayment, orderController.updateInitialPayment);

export default router;
    