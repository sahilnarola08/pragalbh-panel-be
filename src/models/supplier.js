import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema({
     firstName: {
          type: String,
          required: true,
          trim: true,
     },
     lastName: {
          type: String,
          required: true,
          trim: true,
     },
     address: {
          type: String,
          required: true,
          trim: true,
     },
     contactNumber: {
          type: String,
          required: true,
          trim: true,
     },
     company: {
          type: String,
          required: true,
          trim: true,
     },
     advancePayment: {
          type: Number,
          required: true,
          trim: true,
     },
}, {
     timestamps: true,
     toJSON: { virtuals: true },
     toObject: { virtuals: true }
});

// Virtual for full name
supplierSchema.virtual('fullName').get(function () {
     return `${this.firstName} ${this.lastName}`;
});

// Index for better query performance
supplierSchema.index({ company: 1 });
supplierSchema.index({ fullName: 1 });
const Supplier = mongoose.model("Supplier", supplierSchema);

export default Supplier;