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
    /** Optional link to inventory stock (e.g. supplier cost before order exists) */
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: false,
      default: null,
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
    /** Optional: link back to manual bank entry (withdrawal/transfer) */
    manualBankEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ManualBankEntry",
      required: false,
      index: true,
      default: null,
    },
    manualType: {
      type: String,
      required: false,
      enum: ["withdrawal", "transfer"],
      default: null,
      index: true,
    },
    /** Optional: categorize expense as part of order-level components (shipping/packaging/other). */
    componentType: {
      type: String,
      required: false,
      enum: ["shipping", "packaging", "other"],
      default: null,
      index: true,
    },
    // Optional category label for standalone extra expenses (not linked to a specific order)
    extraCategoryName: {
      type: String,
      required: false,
      default: null,
      trim: true,
      index: true,
    },
    /** When set, this expense row is tied to order.products[orderProductIndex] (supplier split). */
    orderProductIndex: {
      type: Number,
      required: false,
      default: null,
      index: true,
    },
    supplierLineIndex: {
      type: Number,
      required: false,
      default: null,
    },
    /** Product purchase expense auto-managed by order create/update (not shipping/packaging rows). */
    isOrderProductPurchase: {
      type: Boolean,
      required: false,
      default: false,
      index: true,
    },
    /**
     * Optional linkage for standalone expenses (e.g. salary) — does not affect order profit math.
     * referenceId: related entity (e.g. Employee _id).
     */
    expenseSourceType: {
      type: String,
      required: false,
      default: null,
      index: true,
      validate: {
        validator: (v) => v == null || v === "" || v === "SALARY",
        message: "expenseSourceType must be SALARY when set",
      },
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
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
