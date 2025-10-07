import express from "express";
import controller from "../controllers/supOrdDetailsController.js";

const router = express.Router();

router.get("/:id", controller.getSupplierOrderDetails);
router.post("/payment-status", controller.markPaymentDone);

export default router;