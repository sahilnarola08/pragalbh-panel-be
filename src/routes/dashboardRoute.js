import express from "express";
import dashboardController from "../controllers/dashboardController.js";

const router = express.Router();

// Get dashboard statistics
router.get("/data", dashboardController.getDashboardStats);

export default router;

