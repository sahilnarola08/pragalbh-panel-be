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
      required: false, // Optional - for extra income without order
      index: true,
    },
    Description: {
      type: String,
      required: true,
      trim: true,
    },
    sellingPrice: {
      type: Number,
      required: false, // Optional - for extra income calculated from receivedAmount
      default: 0,
    },
    receivedAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional - for extra income without client
      index: true,
    },
    status: {
      type: String,
      default: DEFAULT_PAYMENT_STATUS,
      required: true,
      enum: Object.values(PAYMENT_STATUS),
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Income = mongoose.model("Income", incomeSchema);
export default Income;

