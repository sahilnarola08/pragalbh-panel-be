import mongoose from "mongoose";

const skuSchema = new mongoose.Schema(
  {
    skuCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    category: { type: String, trim: true, uppercase: true, index: true },
    metal: { type: String, trim: true, uppercase: true, index: true },
    stone: { type: String, trim: true, uppercase: true, index: true },
    collectionCode: { type: String, trim: true, uppercase: true, index: true },
    variant: { type: String, trim: true, uppercase: true, index: true },
    sequence: { type: Number, min: 1 },
    productName: { type: String, trim: true, default: "", index: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    parentSkuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sku",
      default: null,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SkuTemplate",
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SkuClient",
      default: null,
      index: true,
    },
    clientCode: { type: String, trim: true, uppercase: true, default: null },
    jewelryType: {
      type: String,
      enum: ["gold", "diamond", "lab_grown_diamond", "moissanite", "silver", "custom", null],
      default: null,
    },
    orderChannel: {
      type: String,
      enum: ["b2b", "b2c", "etsy", "alibaba", "website", "custom", null],
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "archived", "draft"],
      default: "active",
      index: true,
    },
    qrCodePath: { type: String, default: null },
    barcodePath: { type: String, default: null },
    productImagePath: { type: String, default: null },
    workflowRefs: {
      cadFileId: { type: String, default: null },
      renderFileId: { type: String, default: null },
      manufacturingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
      stockId: { type: mongoose.Schema.Types.ObjectId, ref: "Stock", default: null },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    previewOnly: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null },
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

skuSchema.index(
  { skuCode: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, previewOnly: false } }
);
skuSchema.index({ skuCode: "text", productName: "text" });
skuSchema.index({ category: 1, metal: 1, collectionCode: 1, isDeleted: 1 });
skuSchema.index({ createdAt: -1 });

const Sku = mongoose.model("Sku", skuSchema);
export default Sku;
