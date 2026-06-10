import mongoose from "mongoose";

const productVariantSchema = new mongoose.Schema(
  {
    parentSkuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
      index: true,
    },
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    variantCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    skuCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

productVariantSchema.index({ parentSkuId: 1, variantCode: 1, isDeleted: 1 });

const ProductVariant = mongoose.model("ProductVariant", productVariantSchema);
export default ProductVariant;
