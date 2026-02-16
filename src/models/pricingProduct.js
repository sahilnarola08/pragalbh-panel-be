import mongoose from "mongoose";

const pricingProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("pricingProduct", pricingProductSchema);
