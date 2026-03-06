import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";
import supOrdDetailsController from "../controllers/supOrdDetailsController.js";
import manualBankEntryController from "../controllers/manualBankEntryController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/get-income-expance", authorize("income.view"), incomeExpController.getIncomeExpance);
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
router.post("/payment-status", authorize("expense.edit"), supOrdDetailsController.markPaymentDone);

export default router;
