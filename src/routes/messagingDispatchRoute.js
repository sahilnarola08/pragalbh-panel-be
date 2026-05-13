import express from "express";
import messagingDispatchController from "../controllers/messagingDispatchController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";

const router = express.Router();

router.use(authenticateJWT);

router.post(
  "/send-order-invoice-telegram",
  messagingDispatchController.sendOrderInvoiceTelegram,
);

router.post(
  "/preview-order-invoice-email",
  messagingDispatchController.previewOrderInvoiceEmail,
);

router.post(
  "/send-test-invoice-email",
  messagingDispatchController.sendTestInvoiceEmail,
);

router.post(
  "/send-order-invoice-email",
  messagingDispatchController.sendOrderInvoiceEmail,
);

export default router;
