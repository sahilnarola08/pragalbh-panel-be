import mongoose from "mongoose";

const partnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    currentBalance: {
      type: Number,
      default: 0,
      required: true,
    },
    totalInvested: {
      type: Number,
      default: 0,
      required: true,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

partnerSchema.index({ name: "text", email: "text", phone: "text" });
partnerSchema.index({ isActive: 1, createdAt: -1 });

const Partner = mongoose.model("Partner", partnerSchema);
export default Partner;
