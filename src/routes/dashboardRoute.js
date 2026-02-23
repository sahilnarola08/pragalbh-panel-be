import express from "express";
import dashboardController from "../controllers/dashboardController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.get("/", authorize("dashboard.view"), dashboardController.getDashboard);
router.get("/data", authorize("dashboard.view"), dashboardController.getDashboardStats);

export default router;

