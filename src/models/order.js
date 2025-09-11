import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
     clientName: {
          type: String,
          required: true,
          trim: true,
     },
     address: {
          type: String,
          required: true,
          trim: true,
     },
     product: {
          type: String,
          required: true,
          trim: true,
     },
     orderDate: {
          type: Date,
          required: true,
     },
     dispatchDate: {
          type: Date,
          required: true,
     },
     purchasePrice: {
          type: Number,
          required: true,
          trim: true,
     },
     sellingPrice: {
          type: Number,
          required: true,
          trim: true,
     },
     supplier: {
          type: String,
     },
     orderPlatform: {
          type: String,
          required: true,
          trim: true,
     },
     otherDetails: {
          type: String,
     }
}, {
     timestamps: true,
});

export default mongoose.model("Order", orderSchema);