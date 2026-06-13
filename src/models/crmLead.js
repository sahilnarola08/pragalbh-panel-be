import mongoose from "mongoose";

const crmLeadSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    company: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
    clientType: [{ type: mongoose.Schema.Types.ObjectId, ref: "master" }],
    platforms: [
      {
        platformName: { type: mongoose.Schema.Types.ObjectId, ref: "master" },
        platformUsername: { type: String, trim: true, default: "" },
      },
    ],
    leadPlatform: { type: mongoose.Schema.Types.ObjectId, ref: "master", default: null, index: true },
    accountName: { type: mongoose.Schema.Types.ObjectId, ref: "master", default: null },
    labels: [{ type: String, trim: true }],
    source: { type: String, trim: true, default: "manual" },
    productInterest: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    noteEntries: [
      {
        text: { type: String, trim: true, required: true },
        createdAt: { type: Date, default: Date.now },
        createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null },
      },
    ],
    activityEvents: [
      {
        type: { type: String, trim: true, default: "activity" },
        message: { type: String, trim: true, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        createdAt: { type: Date, default: Date.now },
        createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null },
      },
    ],
    status: {
      type: String,
      default: "new",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CrmTeam",
      default: null,
      index: true,
    },
    pipelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CrmPipeline",
      default: null,
      index: true,
    },
    nextFollowupAt: { type: Date, default: null, index: true },
    convertedCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    convertedAt: { type: Date, default: null },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

crmLeadSchema.index({ ownerUserId: 1, status: 1, createdAt: -1 });
crmLeadSchema.index({ status: 1, nextFollowupAt: 1 });
crmLeadSchema.index({ pipelineId: 1, status: 1, updatedAt: -1 });
crmLeadSchema.index({ teamId: 1, status: 1, updatedAt: -1 });

const CrmLead = mongoose.model("CrmLead", crmLeadSchema);
export default CrmLead;
