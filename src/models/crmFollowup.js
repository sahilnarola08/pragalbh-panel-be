import mongoose from "mongoose";

const crmFollowupSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed", "cancelled"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueAt: { type: Date, default: null, index: true },
    requestId: { type: String, trim: true, default: "", index: true },
    sourceSystem: { type: String, trim: true, default: "crm" },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

crmFollowupSchema.index({ customerId: 1, createdAt: -1 });
crmFollowupSchema.index({ customerId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string", $gt: "" } } });

const CrmFollowup = mongoose.model("CrmFollowup", crmFollowupSchema);
export default CrmFollowup;

