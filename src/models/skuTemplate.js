import mongoose from "mongoose";
import { DEFAULT_TEMPLATE_SEGMENTS, COMPANY_CODE } from "../constants/skuConstants.js";

const skuTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    companyCode: {
      type: String,
      default: COMPANY_CODE,
      trim: true,
      uppercase: true,
    },
  /** Ordered segment keys, e.g. ["COMPANY","CATEGORY","METAL","STONE","COLLECTION","VARIANT","SEQUENCE"] */
    segments: {
      type: [String],
      default: () => [...DEFAULT_TEMPLATE_SEGMENTS],
    },
    separator: {
      type: String,
      default: "-",
    },
    sequencePad: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
    },
    resetSequenceYearly: {
      type: Boolean,
      default: false,
    },
    collectionBasedSequence: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
  },
  { timestamps: true }
);

skuTemplateSchema.index({ isDefault: 1, isActive: 1, isDeleted: 1 });

const SkuTemplate = mongoose.model("SkuTemplate", skuTemplateSchema);
export default SkuTemplate;
