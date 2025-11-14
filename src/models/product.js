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
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true, 
});

const Product = mongoose.model("Product", productSchema);
export default Product;
