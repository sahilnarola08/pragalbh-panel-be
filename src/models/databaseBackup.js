import mongoose from "mongoose";

const databaseBackupSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, index: true },
    size: { type: Number, default: 0 },
    googleDriveFileId: { type: String, default: "", index: true },
    googleDriveWebViewLink: { type: String, default: "" },
    googleDriveWebContentLink: { type: String, default: "" },
    backupType: { type: String, enum: ["AUTO", "MANUAL"], required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null, index: true },
    status: { type: String, enum: ["IN_PROGRESS", "SUCCESS", "FAILED"], default: "IN_PROGRESS", index: true },
    error: { type: String, default: "" },
    logs: { type: String, default: "" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

databaseBackupSchema.index({ createdAt: -1 });

export default mongoose.model("DatabaseBackup", databaseBackupSchema, "database_backups");

