import mongoose from "mongoose";

const commissionTypeEnum = ["percentage", "fixed"];

const mediatorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    commissionType: {
      type: String,
      enum: commissionTypeEnum,
      required: true,
      default: "percentage",
    },
    commissionValue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    settlementDelayDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

mediatorSchema.index({ isActive: 1 });
mediatorSchema.index({ name: "text" });

export default mongoose.model("Mediator", mediatorSchema);
