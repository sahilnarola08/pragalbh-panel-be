import mongoose from "mongoose";
import { ORDER_STATUS, DEFAULT_ORDER_STATUS } from "../helper/enums.js";

const orderSchema = new mongoose.Schema({
     orderId: {
          type: String,
          unique: true,
     },
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
     shippingCost: {
          type: Number,
          default: 0,
     },
     initialPayment: {
          type: Number,
          default: 0,
     },
     bankName: {
          type: String,
          default: "",
     },
     paymentAmount: {
          type: Number,
          default: 0,
     },
     supplier: {
          type: String,
     },
     orderPlatform: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "master",
          required: true,
          index: true,
     },
     mediator: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "master",
          required: false,
          index: true,
     },
     isBankReceived: {
          type: Boolean,
          default: false,
     },
     isMediatorReceived: {
          type: Boolean,
          default: false,
     },
     otherDetails: {
          type: String,
     },
     status: {
          type: String,
          enum: Object.values(ORDER_STATUS),
          default: DEFAULT_ORDER_STATUS,
     },
     productImages: {
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
     trackingId: {
          type: String,
          default: "",
          index: {
               unique: true,
               partialFilterExpression: { trackingId: { $ne: "" } }
          }
     },
     courierCompany: {
          type: String,
          default: ""
     },
     checklist: {
          type: [
               { id: String, label: String, checked: Boolean }
          ],
          default: [
               { id: "diamonds", label: "Check Diamonds", checked: false },
               { id: "movements", label: "Check Movements", checked: false },
               { id: "crown", label: "Check Crown", checked: false },
               { id: "datetime", label: "Check Day Date Time", checked: false },
               { id: "rah", label: "Check RAH", checked: false },
          ]
     },
     trackingIdUpdatedAt: { type: Date },
}, {
     timestamps: true,
});

// Generate order ID 
orderSchema.pre('save', async function (next) {
     if (!this.orderId) {
          const count = await mongoose.model('Order').countDocuments();
          this.orderId = `ORD-${String(count + 1).padStart(4, '0')}`;
     }
     next();
});

export default mongoose.model("Order", orderSchema);