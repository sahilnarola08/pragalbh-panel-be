import mongoose from "mongoose";

export const ASSET_ACTION_TYPES = [
  "create",
  "update",
  "ownership_change",
  "value_update",
  "delete",
  "assign",
  "status_change",
];

const assetHistorySchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ASSET_ACTION_TYPES,
      required: true,
      index: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    oldData: { type: mongoose.Schema.Types.Mixed, default: null },
    newData: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
  }
);

assetHistorySchema.index({ assetId: 1, timestamp: -1 });
assetHistorySchema.index({ actionType: 1, timestamp: -1 });

const AssetHistory = mongoose.model("AssetHistory", assetHistorySchema);
export default AssetHistory;

