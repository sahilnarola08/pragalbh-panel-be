import express from "express";
import messagingDispatchController from "../controllers/messagingDispatchController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";

const router = express.Router();

router.use(authenticateJWT);

router.post(
  "/send-order-invoice-telegram",
  messagingDispatchController.sendOrderInvoiceTelegram,
);

export default router;
