import mongoose from "mongoose";

const crmPipelineStageSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, required: true },
    label: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const crmPipelineSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, index: true },
    description: { type: String, trim: true, default: "" },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    stages: {
      type: [crmPipelineStageSchema],
      default: [
        { key: "new", label: "New Lead" },
        { key: "contacted", label: "Contacted" },
        { key: "qualified", label: "Qualified" },
      ],
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

crmPipelineSchema.index({ name: 1 }, { unique: true });

const CrmPipeline = mongoose.model("CrmPipeline", crmPipelineSchema);
export default CrmPipeline;
