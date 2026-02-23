import mongoose from "mongoose";

export const OWNERSHIP_TYPES = ["individual", "contributed", "company"];
export const FUNDING_SOURCES = ["company", "partner", "loan"];

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: "master", default: null, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "master", default: null, index: true },

    ownershipType: { type: String, enum: OWNERSHIP_TYPES, required: true, index: true },

    // Individual partner-owned asset
    ownerPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", default: null, index: true },

    // Contributed assets
    originalOwnerPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", default: null, index: true },
    contributionDate: { type: Date, default: null },
    contributionValue: { type: Number, default: 0 },

    // Company purchased assets
    purchaseDate: { type: Date, default: null },
    purchaseCost: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    purchaseFundingSource: { type: String, enum: FUNDING_SOURCES, default: "company", index: true },
    purchasedByPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", default: null },

    status: { type: String, default: "active", index: true },
    location: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    documents: { type: [documentSchema], default: [] },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

assetSchema.index({ isDeleted: 1, createdAt: -1 });
assetSchema.index({ ownershipType: 1, status: 1, isDeleted: 1 });

const Asset = mongoose.model("Asset", assetSchema);
export default Asset;

