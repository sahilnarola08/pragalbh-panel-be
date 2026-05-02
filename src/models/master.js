import mongoose from "mongoose";

const masterSchema = new mongoose.Schema({
     name: {
          type: String,
          required: [true, 'Name is required'],
          trim: true,
          index: true,
     },
     master: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "masterassets",
          index: true,
     },
     /** When this row is an account under a specific order platform (e.g. Whatsapp), scopes uniqueness under that platform */
     underPlatform: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "master",
          index: true,
     },
     isActive: {
          type: Boolean,
          default: true,
          index: true,
     },
     isDeleted: {
          type: Boolean,
          default: false,
          index: true,
     },
}, {
     timestamps: true,
     toJSON: { virtuals: true },
     toObject: { virtuals: true }
});

// Uniqueness: (name + master asset) for ordinary masters, OR (name + master asset + platform row) for platform accounts.
// Without underPlatform, only one name per master asset. With underPlatform, same name can repeat per platform (e.g. Shopify vs Whatsapp).
masterSchema.index(
  { name: 1, master: 1, isDeleted: 1 },
  {
    unique: true,
    name: "uniq_master_name_asset_root",
    partialFilterExpression: {
      isDeleted: false,
      $or: [{ underPlatform: { $exists: false } }, { underPlatform: null }],
    },
  }
);
masterSchema.index(
  { name: 1, master: 1, underPlatform: 1, isDeleted: 1 },
  {
    unique: true,
    name: "uniq_master_name_asset_under_platform",
    partialFilterExpression: {
      isDeleted: false,
      underPlatform: { $exists: true, $ne: null },
    },
  }
);

// Additional performance indexes
masterSchema.index({ master: 1, isDeleted: 1, isActive: 1 }); // For master asset filtering
masterSchema.index({ isActive: 1, isDeleted: 1 }); // For active master queries
masterSchema.index({ createdAt: -1 }); // For date-based sorting
// Text index for name search
masterSchema.index({ name: "text" });

const Master = mongoose.model("master", masterSchema);

export default Master;

