import express from "express";
import { paySalary, getSalaryHistory } from "../controllers/salaryController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/pay", authorize("employees.pay_salary"), paySalary);
router.get("/history/:employeeId", authorize("employees.view"), getSalaryHistory);

export default router;
