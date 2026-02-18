import mongoose from "mongoose";

const diamondMmCaratSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    millimeter: { type: String, required: true, trim: true },
    caratWeight: { type: Number, required: true },
  },
  { timestamps: true }
);

diamondMmCaratSchema.index({ category: 1 });
diamondMmCaratSchema.index({ category: 1, caratWeight: 1 });

export default mongoose.model("diamondMmCarat", diamondMmCaratSchema);
