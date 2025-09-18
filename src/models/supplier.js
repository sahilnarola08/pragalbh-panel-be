import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema({
     firstName: {
          type: String,
          required: true,
          trim: true,
          index: true,
     },
     lastName: {
          type: String,
          required: true,
          trim: true,
          index: true,
     },
     address: {
          type: String,
          required: true,
          trim: true,
     },
     contactNumber: {
          type: String,
          required: true,
          unique: true,
          trim: true,
          index: true,
     },
     company: {
          type: String,
          required: true,
          trim: true,
          default: 0,
          index: true,
     },
     advancePayment: {
          type: Number,
          required: true,
          trim: true,
          default: 0,
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

const Supplier = mongoose.model("Supplier", supplierSchema);

export default Supplier;