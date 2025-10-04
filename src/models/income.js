import mongoose from "mongoose";
import { DEFAULT_PAYMENT_STATUS, PAYMENT_STATUS } from "../helper/enums.js";

const incomeSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    Description: {
      type: String,
      required: true,
      trim: true,
    },
    sellingPrice: {
      type: Number,
      required: true,
    },
    receivedAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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

const Income = mongoose.model("Income", incomeSchema);
export default Income;

