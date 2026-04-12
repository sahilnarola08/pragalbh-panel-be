import mongoose from "mongoose";

const salaryPaymentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ["CASH", "BANK", "UPI"],
      required: true,
    },
    notes: { type: String, trim: true, default: "" },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
    /** Linked ExpanseIncome row for expense module */
    expenseIncomeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpanseIncome",
      default: null,
    },
    /** When true, payment is recorded as advance salary (expense description reflects this). */
    isAdvance: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

salaryPaymentSchema.index({ employeeId: 1, paymentDate: -1 });

const SalaryPayment = mongoose.model("SalaryPayment", salaryPaymentSchema);
export default SalaryPayment;
