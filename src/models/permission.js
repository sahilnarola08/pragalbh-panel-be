import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    module: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

permissionSchema.index({ module: 1, action: 1 }, { unique: true });

const Permission = mongoose.model("Permission", permissionSchema);
export default Permission;
