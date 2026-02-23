import mongoose from "mongoose";

const TARGET_TYPES = ["weekly", "monthly", "yearly"];

const targetSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: TARGET_TYPES,
      trim: true,
      index: true,
    },
    salesTargetAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    profitTargetAmount: {
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

targetSchema.index({ type: 1, isActive: 1 });

export default mongoose.model("Target", targetSchema);
