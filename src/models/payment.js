import mongoose from "mongoose";
import {
  PAYMENT_LIFECYCLE_STATUS,
  DEFAULT_PAYMENT_LIFECYCLE_STATUS,
} from "../helper/enums.js";

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    /** 0-based index into order.products; optional, for grouping payments per product in UI */
    productIndex: {
      type: Number,
      default: null,
      index: true,
    },
    grossAmountUSD: {
      type: Number,
      required: true,
      min: 0,
    },
    mediatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mediator",
      required: true,
      index: true,
    },
    mediatorCommissionType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    mediatorCommissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    mediatorCommissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmountUSD: {
      type: Number,
      default: 0,
      min: 0,
    },
    conversionRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedAmountINR: {
      type: Number,
      default: 0,
      min: 0,
    },
    actualBankCreditINR: {
      type: Number,
      default: null,
    },
    exchangeDifference: {
      type: Number,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_LIFECYCLE_STATUS),
      default: DEFAULT_PAYMENT_LIFECYCLE_STATUS,
      index: true,
    },
    transactionReference: {
      type: String,
      default: "",
      trim: true,
    },
    creditedDate: {
      type: Date,
      default: null,
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      default: null,
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
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
  { timestamps: true }
);

paymentSchema.index({ orderId: 1, createdAt: 1 });
paymentSchema.index({ paymentStatus: 1 });
paymentSchema.index({ creditedDate: 1 });

paymentSchema.pre("save", function (next) {
  const self = this;
  const gross = Number(self.grossAmountUSD) || 0;
  const commissionType = self.mediatorCommissionType || "percentage";
  const commissionValue = Number(self.mediatorCommissionValue) || 0;
  let commissionAmount = Number(self.mediatorCommissionAmount);
  if (commissionAmount == null || isNaN(commissionAmount)) {
    if (commissionType === "percentage") {
      commissionAmount = Math.round((gross * commissionValue) / 100 * 100) / 100;
    } else {
      commissionAmount = Math.round(commissionValue * 100) / 100;
    }
    self.mediatorCommissionAmount = commissionAmount;
  }
  const netUSD = Math.round((gross - commissionAmount) * 100) / 100;
  if (self.netAmountUSD !== netUSD) {
    self.netAmountUSD = netUSD;
  }
  const rate = Number(self.conversionRate) || 0;
  const expectedINR = rate > 0 ? Math.round(netUSD * rate * 100) / 100 : 0;
  if (self.expectedAmountINR !== expectedINR) {
    self.expectedAmountINR = expectedINR;
  }
  const actual = self.actualBankCreditINR;
  if (actual != null && typeof actual === "number" && !isNaN(actual) && self.expectedAmountINR != null) {
    const diff = Math.round((actual - self.expectedAmountINR) * 100) / 100;
    if (self.exchangeDifference !== diff) {
      self.exchangeDifference = diff;
    }
  }
  next();
});

export default mongoose.model("Payment", paymentSchema);
