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
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      index: true,
    },
    status: {
      type: String,
      default: DEFAULT_PAYMENT_STATUS,
      required: true,
      enum: Object.values(PAYMENT_STATUS),
      index: true, // Index for faster dashboard queries
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better performance
expanseIncomeSchema.index({ status: 1, paidAmount: 1 }); // For expense queries
expanseIncomeSchema.index({ date: 1 }); // For date range queries
expanseIncomeSchema.index({ createdAt: 1 }); // For createdAt queries

const ExpanseIncome = mongoose.model("ExpanseIncome", expanseIncomeSchema);
export default ExpanseIncome;
