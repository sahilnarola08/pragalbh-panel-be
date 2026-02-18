import express from "express";
import incomeExpController from "../controllers/incomeExpanceController.js";
import supOrdDetailsController from "../controllers/supOrdDetailsController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/get-income-expance", authorize("income.view"), incomeExpController.getIncomeExpance);
router.post("/add-income", authorize("income.create"), incomeExpController.addIncomeEntry);
router.put("/edit-income/:incomeId", authorize("income.edit"), incomeExpController.editIncomeEntry);
router.put("/update-payment-status", authorize("income.edit"), incomeExpController.updateIncomePaymentStatus);
router.post("/add-expense", authorize("expense.create"), incomeExpController.addExpanseEntry);
router.put("/update-expense/:ExpId", authorize("expense.edit"), incomeExpController.editExpanseEntry);
router.post("/add-extra-income", authorize("income.create"), incomeExpController.addExtraIncome);
router.put("/edit-extra-income/:incomeId", authorize("income.edit"), incomeExpController.editExtraIncome);
router.get("/get-income/:incomeId", authorize("income.view"), incomeExpController.getIncomeById);
router.post("/add-extra-expense", authorize("expense.create"), incomeExpController.addExtraExpense);
router.put("/edit-extra-expense/:expenseId", authorize("expense.edit"), incomeExpController.editExtraExpense);
router.get("/get-expense/:expenseId", authorize("expense.view"), incomeExpController.getExpenseById);
router.post("/payment-status", authorize("expense.edit"), supOrdDetailsController.markPaymentDone);



export default router;
