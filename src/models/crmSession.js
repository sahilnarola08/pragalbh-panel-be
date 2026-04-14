import mongoose from "mongoose";

const crmSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
    panelUserId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
    panelTokenEncrypted: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, default: Date.now },
    deviceInfo: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    revokedAt: { type: Date, default: null, index: true },
    revokedReason: { type: String, default: "" },
  },
  { timestamps: true }
);

crmSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CrmSession = mongoose.model("CrmSession", crmSessionSchema);

export default CrmSession;
