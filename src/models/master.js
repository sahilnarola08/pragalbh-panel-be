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

// Compound index to ensure unique name (excluding deleted records)
masterSchema.index({ name: 1, isDeleted: 1 }, { 
     unique: true,
     partialFilterExpression: { isDeleted: false }
});

const Master = mongoose.model("master", masterSchema);

export default Master;

