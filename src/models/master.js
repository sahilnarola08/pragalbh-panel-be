import mongoose from "mongoose";

const masterSchema = new mongoose.Schema({
     name: {
          type: String,
          required: [true, 'Name is required'],
          trim: true,
          index: true,
     },
     master: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "masterassets",
          index: true,
     },
     isActive: {
          type: Boolean,
          default: true,
          index: true,
     },
     isDeleted: {
          type: Boolean,
          default: false,
          index: true,
     },
}, {
     timestamps: true,
     toJSON: { virtuals: true },
     toObject: { virtuals: true }
});

// Compound index to ensure unique name and master combination (excluding deleted records)
masterSchema.index({ name: 1, master: 1, isDeleted: 1 }, { 
     unique: true,
     partialFilterExpression: { isDeleted: false }
});

// Additional performance indexes
masterSchema.index({ master: 1, isDeleted: 1, isActive: 1 }); // For master asset filtering
masterSchema.index({ isActive: 1, isDeleted: 1 }); // For active master queries
masterSchema.index({ createdAt: -1 }); // For date-based sorting
// Text index for name search
masterSchema.index({ name: "text" });

const Master = mongoose.model("master", masterSchema);

export default Master;

