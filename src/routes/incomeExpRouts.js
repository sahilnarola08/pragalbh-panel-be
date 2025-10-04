import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";

const router = express.Router();

    router.get("/get-income-expance", incomeExpController.getIncomeExpance);

export default router;
