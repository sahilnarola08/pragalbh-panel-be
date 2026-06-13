import mongoose from "mongoose";

/**
 * Atomic counters per scope (collection, client, year, variant parent, etc.)
 * scopeKey examples:
 *   default:PJ:RNG:18K:DIA:CLS:YG
 *   collection:CLS
 *   client:ROLEX:RNG
 *   year:2026:RNG
 */
const skuSequenceSchema = new mongoose.Schema(
  {
    scopeKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    currentValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    resetYearly: {
      type: Boolean,
      default: false,
    },
    year: {
      type: Number,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

skuSequenceSchema.index({ scopeKey: 1 }, { unique: true });

const SkuSequence = mongoose.model("SkuSequence", skuSequenceSchema);
export default SkuSequence;
