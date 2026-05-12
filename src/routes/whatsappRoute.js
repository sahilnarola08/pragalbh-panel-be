import express from "express";
import whatsappController from "../controllers/whatsappController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";

const router = express.Router();

router.use(authenticateJWT);

router.post("/send-test", whatsappController.sendTestMessage);
router.post("/send-order-invoice", whatsappController.sendOrderInvoice);

export default router;
