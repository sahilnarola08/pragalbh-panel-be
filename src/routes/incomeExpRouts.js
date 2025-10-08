import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";

const router = express.Router();

router.get("/get-income-expance", incomeExpController.getIncomeExpance);
router.post("/add-income", incomeExpController.addIncomeEntry);
router.put("/edit-income/:incomeId", incomeExpController.editIncomeEntry);
router.put("/update-payment-status", incomeExpController.updateIncomePaymentStatus);

export default router;
