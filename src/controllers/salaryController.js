import mongoose from "mongoose";
import Employee from "../models/employee.js";
import SalaryPayment from "../models/salaryPayment.js";
import ExpanceIncome from "../models/expance_inc.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { PAYMENT_STATUS } from "../helper/enums.js";
import { normalizeBankMasterId } from "../util/normalizeBankMasterId.js";

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const METHODS = new Set(["CASH", "BANK", "UPI"]);

export const paySalary = async (req, res) => {
  try {
    const { employeeId, amount, paymentDate, paymentMethod, notes, bankId, isAdvance } = req.body;

    if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
      return sendErrorResponse({ res, status: 400, message: "Valid employeeId is required" });
    }

    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } });
    if (!employee) {
      return sendErrorResponse({ res, status: 404, message: "Employee not found" });
    }

    const amt = round2(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return sendErrorResponse({ res, status: 400, message: "Amount must be a positive number" });
    }

    const method = String(paymentMethod || "").toUpperCase();
    if (!METHODS.has(method)) {
      return sendErrorResponse({ res, status: 400, message: "paymentMethod must be CASH, BANK, or UPI" });
    }

    let normalizedBankId = null;
    if (method === "BANK") {
      try {
        normalizedBankId = await normalizeBankMasterId(bankId);
        if (!normalizedBankId) {
          return sendErrorResponse({ res, status: 400, message: "bankId is required for BANK payments" });
        }
      } catch (err) {
        return sendErrorResponse({
          res,
          status: err.status || 400,
          message: err.message || "Invalid bank",
        });
      }
    } else {
      try {
        normalizedBankId = await normalizeBankMasterId(bankId);
      } catch {
        normalizedBankId = null;
      }
    }

    const payDate = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(payDate.getTime())) {
      return sendErrorResponse({ res, status: 400, message: "Invalid paymentDate" });
    }

    const advance =
      isAdvance === true || isAdvance === "true" || isAdvance === 1 || isAdvance === "1";
    const empName = String(employee.name || "Employee").trim();
    const description = advance ? `Advance salary paid to ${empName}` : `Salary paid to ${empName}`;

    let expense = null;
    try {
      expense = await ExpanceIncome.create({
        date: payDate,
        description,
        paidAmount: amt,
        dueAmount: 0,
        bankId: normalizedBankId,
        status: PAYMENT_STATUS.PAID,
        extraCategoryName: "SALARY",
        expenseSourceType: "SALARY",
        referenceId: employee._id,
      });

      const payment = await SalaryPayment.create({
        employeeId: employee._id,
        amount: amt,
        paymentDate: payDate,
        paymentMethod: method,
        notes: String(notes || "").trim().slice(0, 2000),
        bankId: normalizedBankId,
        createdBy: req.user?._id || null,
        expenseIncomeId: expense._id,
        isAdvance: advance,
      });

      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache("income");
      invalidateCache("employees");
      invalidateCache("salary");
      invalidateCache("dashboard");

      return sendSuccessResponse({
        res,
        status: 201,
        message: "Salary payment recorded and expense created",
        data: {
          salaryPayment: payment.toObject(),
          expenseId: expense._id,
        },
      });
    } catch (innerErr) {
      if (expense?._id) {
        await ExpanceIncome.deleteOne({ _id: expense._id }).catch(() => {});
      }
      throw innerErr;
    }

  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};

export const getSalaryHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(employeeId))) {
      return sendErrorResponse({ res, status: 400, message: "Invalid employee id" });
    }

    const exists = await Employee.findById(employeeId).select("_id").lean();
    if (!exists) {
      return sendErrorResponse({ res, status: 404, message: "Employee not found" });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      SalaryPayment.find({ employeeId })
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("bankId", "name")
        .lean(),
      SalaryPayment.countDocuments({ employeeId }),
    ]);

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Salary history",
      data: { items, total, page, limit },
    });
  } catch (e) {
    return sendErrorResponse({ res, status: 500, message: e.message });
  }
};
