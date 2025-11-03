import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";
import supOrdDetailsController from "../controllers/supOrdDetailsController.js";

const router = express.Router();

// Income routes
router.get("/get-income-expance", incomeExpController.getIncomeExpance);
router.post("/add-income", incomeExpController.addIncomeEntry);
router.put("/edit-income/:incomeId", incomeExpController.editIncomeEntry);
router.put("/update-payment-status", incomeExpController.updateIncomePaymentStatus);

// Extra Income routes (without order/client)
router.post("/add-extra-income", incomeExpController.addExtraIncome);
router.put("/edit-extra-income/:incomeId", incomeExpController.editExtraIncome);
router.get("/get-income/:incomeId", incomeExpController.getIncomeById);

// Extra Expense routes (without order/supplier)
router.post("/add-extra-expense", incomeExpController.addExtraExpense);
router.put("/edit-extra-expense/:expenseId", incomeExpController.editExtraExpense);
router.get("/get-expense/:expenseId", incomeExpController.getExpenseById);

// Payment Status route - Mark expense payment as done
router.post("/payment-status", supOrdDetailsController.markPaymentDone);

export default router;
