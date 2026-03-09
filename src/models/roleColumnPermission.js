import mongoose from "mongoose";

const roleColumnPermissionSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    moduleName: { type: String, required: true, trim: true, index: true },
    tableName: { type: String, required: true, trim: true, index: true },
    columnName: { type: String, required: true, trim: true, index: true },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique constraint: one row per (roleId, moduleName, tableName, columnName)
roleColumnPermissionSchema.index(
  { roleId: 1, moduleName: 1, tableName: 1, columnName: 1 },
  { unique: true }
);

const RoleColumnPermission = mongoose.model("RoleColumnPermission", roleColumnPermissionSchema);
export default RoleColumnPermission;
