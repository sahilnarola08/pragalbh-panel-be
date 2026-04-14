import mongoose from "mongoose";

const crmRefreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmSession", required: true, index: true },
    deviceInfo: { type: String, default: "" },
    rotatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "CrmRefreshToken", default: null, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
    revokeReason: { type: String, default: "" },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

crmRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CrmRefreshToken = mongoose.model("CrmRefreshToken", crmRefreshTokenSchema);

export default CrmRefreshToken;
