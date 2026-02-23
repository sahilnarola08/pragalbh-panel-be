import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, trim: true, default: "" },
    permissions: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Role = mongoose.model("Role", roleSchema);
export default Role;
