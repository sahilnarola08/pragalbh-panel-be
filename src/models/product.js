import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  category: {
     type: mongoose.Schema.Types.ObjectId,
     ref: "master",
     required: true,
     index: true,
  },
  productName: {
     type: String,
     required: true,
     trim: true,
     index: true,
  },
  imageURLs: {
    type: [
      {
        img: {
          type: String,
          required: false,
        },
      },
    ],
    default: [
      {
        img: "https://placehold.co/100x100/A0B2C7/FFFFFF?text=Product",
      },
    ],
  },
  skuId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sku",
    default: null,
    index: true,
  },
  skuCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: null,
    sparse: true,
    index: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
}, {
  timestamps: true, 
});

// Performance indexes
productSchema.index({ category: 1, isDeleted: 1 }); // Compound index for category queries
productSchema.index({ createdAt: -1 }); // For date-based sorting
productSchema.index({ productName: 1, isDeleted: 1 }); // Compound index for search
// Text index for product name search
productSchema.index({ productName: "text" });

const Product = mongoose.model("Product", productSchema);
export default Product;
