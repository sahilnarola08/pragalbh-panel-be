import mongoose from "mongoose";

const laborPriceSchema = new mongoose.Schema(
  {
    metalType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Alloy", "Silver", "Gold", "Platinum"],
      index: true,
    },
    pricePerGram: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

laborPriceSchema.index({ metalType: 1, isActive: 1 });
laborPriceSchema.index({ metalType: 1, effectiveFrom: -1 });

export default mongoose.model("laborPrice", laborPriceSchema);
