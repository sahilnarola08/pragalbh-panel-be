import mongoose from "mongoose";

const PAYMENT_MODES = ["cash", "bank", "upi", "cheque"];
const TRANSACTION_TYPES = ["investment", "withdrawal", "adjustment"];

const partnerTransactionSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      // positive for investment/withdrawal; can be negative for adjustment
    },
    balanceAfterTransaction: {
      type: Number,
      required: true,
    },
    paymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: "cash",
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

partnerTransactionSchema.index({ partnerId: 1, transactionDate: -1 });
partnerTransactionSchema.index({ partnerId: 1, type: 1 });

const PartnerTransaction = mongoose.model("PartnerTransaction", partnerTransactionSchema);
export default PartnerTransaction;
export { PAYMENT_MODES, TRANSACTION_TYPES };
