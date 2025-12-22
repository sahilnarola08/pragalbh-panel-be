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
     products: {
          type: [
               {
                    productName: {
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
                    },
                    sellingPrice: {
                         type: Number,
                         required: true,
                    },
                    initialPayment: {
                         type: Number,
                         default: 0,
                    },
                    orderPlatform: {
                         type: mongoose.Schema.Types.ObjectId,
                         ref: "master",
                         required: true,
                    },
                    mediator: {
                         type: mongoose.Schema.Types.ObjectId,
                         ref: "master",
                         required: false,
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
                         default: [],
                    },
               },
          ],
          required: true,
          validate: {
               validator: function(v) {
                    return Array.isArray(v) && v.length > 0;
               },
               message: "At least one product is required",
          },
     },
     shippingCost: {
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
     otherDetails: {
          type: String,
     },
     status: {
          type: String,
          enum: Object.values(ORDER_STATUS),
          default: DEFAULT_ORDER_STATUS,
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
     isDeleted: {
          type: Boolean,
          default: false,
          index: true,
     },
}, {
     timestamps: true,
});

// Performance indexes
orderSchema.index({ status: 1, createdAt: -1 }); // For status-based queries with sorting
orderSchema.index({ clientName: 1 }); // For client name searches
orderSchema.index({ createdAt: -1 }); // For date-based sorting
orderSchema.index({ "products.orderDate": 1 }); // For order date filtering
orderSchema.index({ "products.orderPlatform": 1 }); // For platform filtering
// Text index for search optimization
orderSchema.index({ clientName: "text", address: "text", supplier: "text", "products.productName": "text" });

// Generate order ID in format: PJMMYYNN
// PJ: Pragalbh Jewels (Static)
// MM: Month (2 digits)
// YY: Year (last 2 digits)
// NN: Order sequence for the month (starts from 01 each month)
orderSchema.pre('save', async function (next) {
     if (!this.orderId) {
          const now = new Date();
          const month = String(now.getMonth() + 1).padStart(2, '0'); // 01-12
          const year = String(now.getFullYear()).slice(-2); // Last 2 digits of year
          
          // Get the start and end of current month
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          
          // Count orders created in the current month
          const count = await mongoose.model('Order').countDocuments({
               createdAt: {
                    $gte: startOfMonth,
                    $lte: endOfMonth
               }
          });
          
          // Generate sequence number (starts from 01)
          const sequence = String(count + 1).padStart(2, '0');
          
          // Generate order ID: PJ + MM + YY + NN
          this.orderId = `PJ${month}${year}${sequence}`;
     }
     next();
});

export default mongoose.model("Order", orderSchema);