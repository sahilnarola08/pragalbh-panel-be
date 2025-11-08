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
  image: {
   type: String,
   default: "https://placehold.co/100x100/A0B2C7/FFFFFF?text=Product"
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
