import mongoose from "mongoose";

const diamondPriceSchema = new mongoose.Schema(
  {
    origin: { type: String, required: true, trim: true },
    shape: { type: String, required: true, trim: true },
    carat_min: { type: Number, required: true },
    carat_max: { type: Number, required: true },
    color: { type: String, required: true, trim: true },
    clarity: { type: String, required: true, trim: true },
    cut_grade: { type: String, required: true, trim: true },
    price_per_carat: { type: Number, required: true },
  },
  { timestamps: true }
);

diamondPriceSchema.index({ origin: 1, shape: 1, carat_min: 1 });
diamondPriceSchema.index({ origin: 1, shape: 1, color: 1, clarity: 1 });

export default mongoose.model("diamondPrice", diamondPriceSchema);
