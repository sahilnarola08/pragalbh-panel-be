import mongoose from "mongoose";

const purchaseSupplierLineSchema = new mongoose.Schema(
  {
    supplierName: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const STOCK_STATUS = {
  IN_STOCK: "in_stock",
  CONVERTED: "converted",
  CANCELLED: "cancelled",
};

const stockSchema = new mongoose.Schema(
  {
    stockCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    supplierName: {
      type: String,
      trim: true,
      default: "",
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    purchaseSupplierLines: {
      type: [purchaseSupplierLineSchema],
      default: undefined,
    },
    productImages: {
      type: [{ img: { type: String } }],
      default: [],
    },
    stockDate: {
      type: Date,
      default: Date.now,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(STOCK_STATUS),
      default: STOCK_STATUS.IN_STOCK,
      index: true,
    },
    convertedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

stockSchema.index({ status: 1, createdAt: -1 });
stockSchema.index({ productName: "text", stockCode: "text", notes: "text" });

stockSchema.pre("save", async function (next) {
  if (!this.stockCode) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const count = await mongoose.model("Stock").countDocuments({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    });
    const sequence = String(count + 1).padStart(2, "0");
    this.stockCode = `ST${month}${year}${sequence}`;
  }
  next();
});

export const STOCK_STATUS_VALUES = STOCK_STATUS;
export default mongoose.model("Stock", stockSchema);
