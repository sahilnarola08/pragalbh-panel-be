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
      index: true, // Index for faster dashboard queries
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      index: true,
    },
    isBankReceived: {
      type: Boolean,
      default: false,
    },
    isMediatorReceived: {
      type: Boolean,
      default: false,
    },
    mediator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      required: false,
      index: true,
    },
    mediatorAmount: {
      type: [
        {
          mediatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "master",
            required: true,
          },
          amount: {
            type: Number,
            required: true,
            default: 0,
          }
        }
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better performance
incomeSchema.index({ status: 1, receivedAmount: 1 }); // For pending/received payment queries
incomeSchema.index({ date: 1 }); // For date range queries

const Income = mongoose.model("Income", incomeSchema);
export default Income;

