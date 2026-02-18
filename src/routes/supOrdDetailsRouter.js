import express from "express";
import controller from "../controllers/supOrdDetailsController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.get("/:id", authorize("orders.view"), controller.getSupplierOrderDetails);

export default router;