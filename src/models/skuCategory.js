import mongoose from "mongoose";

const skuCategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
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
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
  },
  { timestamps: true }
);

skuCategorySchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

const SkuCategory = mongoose.model("SkuCategory", skuCategorySchema);
export default SkuCategory;
