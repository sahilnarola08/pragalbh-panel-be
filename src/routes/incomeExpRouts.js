import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";
import supOrdDetailsController from "../controllers/supOrdDetailsController.js";
import manualBankEntryController from "../controllers/manualBankEntryController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

// Expense list (incExpType=2) is used by Expense page with expense.view; income/credits need income.view
router.get(
  "/get-income-expance",
  authorizeAny(["income.view", "expense.view"]),
  incomeExpController.getIncomeExpance
);
router.post("/add-manual-bank-entry", authorize("income.create"), manualBankEntryController.addManualBankEntry);
router.put("/soft-delete-manual-bank-entry/:entryId", authorize("income.delete"), manualBankEntryController.softDeleteManualBankEntry);
router.put("/restore-manual-bank-entry/:entryId", authorize("income.edit"), manualBankEntryController.restoreManualBankEntry);
router.post("/add-expense", authorize("expense.create"), incomeExpController.addExpanseEntry);
router.put("/update-expense/:ExpId", authorize("expense.edit"), incomeExpController.editExpanseEntry);
router.post("/add-extra-expense", authorize("expense.create"), incomeExpController.addExtraExpense);
router.put("/edit-extra-expense/:expenseId", authorize("expense.edit"), incomeExpController.editExtraExpense);
router.get("/get-expense/:expenseId", authorize("expense.view"), incomeExpController.getExpenseById);
router.put("/soft-delete-expense/:expenseId", authorize("expense.delete"), incomeExpController.softDeleteExpense);
router.put("/restore-expense/:expenseId", authorize("expense.edit"), incomeExpController.restoreExpense);
router.get("/extra-expense-categories", authorize("expense.view"), incomeExpController.getExtraExpenseCategories);
router.put("/extra-expense-categories/rename", authorize("expense.edit"), incomeExpController.renameExtraExpenseCategory);
router.put("/extra-expense-categories/delete", authorize("expense.edit"), incomeExpController.deleteExtraExpenseCategory);
router.post("/extra-expense-categories/delete", authorize("expense.edit"), incomeExpController.deleteExtraExpenseCategory);
router.post("/payment-status", authorize("expense.edit"), supOrdDetailsController.markPaymentDone);

export default router;
