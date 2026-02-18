import express from "express";
import schedulerController from "../controllers/schedulerController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.post("/check-over-due/", authorize("orders.view"), schedulerController.checkOverDue);

export default router;