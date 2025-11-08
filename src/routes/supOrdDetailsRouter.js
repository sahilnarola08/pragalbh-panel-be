import express from "express";
import controller from "../controllers/supOrdDetailsController.js";

const router = express.Router();

router.get("/:id", controller.getSupplierOrderDetails);

export default router;