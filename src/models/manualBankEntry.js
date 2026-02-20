import mongoose from "mongoose";

const manualBankEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["deposit", "withdrawal", "transfer"],
      index: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    /** For deposit/withdrawal: the bank. For transfer: from bank (debit). */
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      required: true,
      index: true,
    },
    /** For transfer only: to bank (credit). */
    toBankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "master",
      required: false,
      index: true,
    },
  },
  { timestamps: true }
);

manualBankEntrySchema.index({ date: 1 });
manualBankEntrySchema.index({ bankId: 1, date: 1 });
manualBankEntrySchema.index({ toBankId: 1, date: 1 });

const ManualBankEntry = mongoose.model("ManualBankEntry", manualBankEntrySchema);
export default ManualBankEntry;
