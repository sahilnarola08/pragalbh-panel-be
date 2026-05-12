import mongoose from "mongoose";

const crmTeamSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, unique: true },
    slug: { type: String, trim: true, required: true, unique: true, index: true },
    description: { type: String, trim: true, default: "" },
    memberUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Auth", index: true }],
    isActive: { type: Boolean, default: true, index: true },
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

crmTeamSchema.index({ memberUserIds: 1, isActive: 1 });

const CrmTeam = mongoose.model("CrmTeam", crmTeamSchema);
export default CrmTeam;
