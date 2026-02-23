import mongoose from "mongoose";

const loginSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    deviceName: { type: String, default: "" },
    deviceType: { type: String, default: "" },
    browser: { type: String, default: "" },
    location: { type: String, default: "" },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

loginSessionSchema.index({ userId: 1, createdAt: -1 });
loginSessionSchema.index({ lastActiveAt: 1 });

const LoginSession = mongoose.model("LoginSession", loginSessionSchema);
export default LoginSession;
