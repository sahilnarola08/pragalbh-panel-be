import mongoose from "mongoose";

const masterAssetsSchema = new mongoose.Schema({
     name: {
          type: String,
          required: [true, 'Name is required'],
          trim: true,
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

// Compound index to ensure unique name per master (excluding deleted records)
masterAssetsSchema.index({ master: 1, name: 1, isDeleted: 1 }, { 
     unique: true,
     partialFilterExpression: { isDeleted: false }
});

const MasterAssets = mongoose.model("masterassets", masterAssetsSchema);

export default MasterAssets;

