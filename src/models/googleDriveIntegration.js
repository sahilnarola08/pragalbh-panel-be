import mongoose from "mongoose";

const googleDriveIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, unique: true, index: true },
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
    refreshToken: { type: String, required: true },
    folderId: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("GoogleDriveIntegration", googleDriveIntegrationSchema, "google_drive_integrations");
