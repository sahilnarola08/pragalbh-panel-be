import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  category: {
     type: String,
     required: true,
     trim: true,
     index: true,
  },
  productName: {
     type: String,
     required: true,
     trim: true,
     index: true,
  },
}, {
  timestamps: true, 
});

const Product = mongoose.model("Product", productSchema);
export default Product;
