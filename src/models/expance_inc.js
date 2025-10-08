import mongoose from "mongoose";
import { PAYMENT_STATUS, DEFAULT_PAYMENT_STATUS } from "../helper/enums.js";

const expanseIncomeSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,  // Changed to false to allow standalone expenses
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: false,  // Changed to false to allow standalone expenses
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    bankId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      default: DEFAULT_PAYMENT_STATUS,
      required: true,
      enum: Object.values(PAYMENT_STATUS),
    },
  },
  {
    timestamps: true,
  }
);

const ExpanseIncome = mongoose.model("ExpanseIncome", expanseIncomeSchema);
export default ExpanseIncome;
