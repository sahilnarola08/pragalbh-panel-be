import express from "express";
import paymentController from "../controllers/paymentController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/", authorize("income.create"), paymentController.createPayment);
router.get("/", authorize("income.view"), paymentController.listPayments);
router.get("/currency-rate", authorize("income.view"), paymentController.getCurrencyRate);
router.get("/order/:orderId", authorize("income.view"), paymentController.getPaymentsByOrderId);
router.get("/:id", authorize("income.view"), paymentController.getPaymentById);
router.put("/:id", authorize("income.edit"), paymentController.updatePayment);
router.delete("/:id", authorize("income.delete"), paymentController.deletePayment);

export default router;
