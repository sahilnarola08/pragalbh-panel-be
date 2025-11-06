import mongoose from "mongoose";
import { MASTER_TYPE } from "../helper/enums.js";

const masterSchema = new mongoose.Schema({
     name: {
          type: String,
          required: [true, 'Name is required'],
          trim: true,
          index: true,
     },
     masterType: {
          type: Number,
          required: [true, 'Master type is required'],
          enum: Object.values(MASTER_TYPE),
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

// Compound index to ensure unique name per masterType (excluding deleted records)
masterSchema.index({ name: 1, masterType: 1, isDeleted: 1 }, { 
     unique: true,
     partialFilterExpression: { isDeleted: false }
});

const Master = mongoose.model("Master", masterSchema);

export default Master;

