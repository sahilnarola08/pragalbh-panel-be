import mongoose from "mongoose";

const coastSettingsSchema = new mongoose.Schema(
  {
    current_gold_price: { type: Number, required: true, default: 6000 },
    current_silver_price: { type: Number, required: true, default: 80 },
    default_profit_margin: { type: Number, required: true, default: 0.45 },
  },
  { timestamps: true }
);

// Singleton: only one document (id: "default")
coastSettingsSchema.index({ _id: 1 }, { unique: true });

export default mongoose.model("coastSettings", coastSettingsSchema);
