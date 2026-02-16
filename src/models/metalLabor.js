import mongoose from "mongoose";

const metalLaborSchema = new mongoose.Schema(
  {
    metal_type: { type: String, required: true, trim: true },
    purity_name: { type: String, required: true, trim: true },
    purity_factor: { type: Number, required: true },
    labor_per_gram: { type: Number, required: true },
  },
  { timestamps: true }
);

metalLaborSchema.index({ metal_type: 1, purity_name: 1 }, { unique: true });

export default mongoose.model("metalLabor", metalLaborSchema);
