import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";

const router = express.Router();

// Income routes
router.get("/get-income-expance", incomeExpController.getIncomeExpance);
router.post("/add-income", incomeExpController.addIncomeEntry);
router.put("/edit-income/:incomeId", incomeExpController.editIncomeEntry);
router.put("/update-payment-status", incomeExpController.updateIncomePaymentStatus);

// Extra Expense routes (without order/supplier)
router.post("/add-extra-expense", incomeExpController.addExtraExpense);
router.put("/edit-extra-expense/:expenseId", incomeExpController.editExtraExpense);
router.get("/get-expense/:expenseId", incomeExpController.getExpenseById);

export default router;
