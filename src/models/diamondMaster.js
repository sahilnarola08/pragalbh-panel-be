import mongoose from "mongoose";

const diamondMasterSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      enum: ["diamondType", "clarity", "color", "cut", "shape"],
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

diamondMasterSchema.index({ type: 1, slug: 1 }, { unique: true });
diamondMasterSchema.index({ type: 1, isActive: 1, displayOrder: 1 });

export default mongoose.model("diamondMaster", diamondMasterSchema);
