import express from "express";
import paymentController from "../controllers/paymentController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/", authorizeAny(["payment.create", "income.create"]), paymentController.createPayment);
router.get("/", authorizeAny(["payment.view", "income.view"]), paymentController.listPayments);
router.get("/currency-rate", authorizeAny(["payment.view", "income.view"]), paymentController.getCurrencyRate);
router.get("/order/:orderId", authorizeAny(["payment.view", "income.view"]), paymentController.getPaymentsByOrderId);
router.get("/:id", authorizeAny(["payment.view", "income.view"]), paymentController.getPaymentById);
router.put("/:id", authorizeAny(["payment.edit", "income.edit"]), paymentController.updatePayment);
router.delete("/:id", authorizeAny(["payment.delete", "income.delete"]), paymentController.deletePayment);
router.put("/:id/restore", authorizeAny(["payment.edit", "income.edit"]), paymentController.restorePayment);

export default router;
