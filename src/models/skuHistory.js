import mongoose from "mongoose";

const skuHistorySchema = new mongoose.Schema(
  {
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["created", "updated", "deleted", "regenerated", "linked", "unlinked"],
      required: true,
    },
    oldSkuCode: {
      type: String,
      default: null,
    },
    newSkuCode: {
      type: String,
      default: null,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

skuHistorySchema.index({ skuId: 1, createdAt: -1 });

const SkuHistory = mongoose.model("SkuHistory", skuHistorySchema);
export default SkuHistory;
