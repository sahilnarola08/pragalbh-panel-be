import mongoose from "mongoose";

/** B2B client codes for client-specific SKU sequences (e.g. PJ-ROLEX-RNG-00001) */
const skuClientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
  },
  { timestamps: true }
);

skuClientSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

const SkuClient = mongoose.model("SkuClient", skuClientSchema);
export default SkuClient;
