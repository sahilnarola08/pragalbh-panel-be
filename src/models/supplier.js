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
          type: [
               {
                    bankId: {
                         type: mongoose.Schema.Types.ObjectId,
                         ref: "master",
                         required: true,
                    },
                    amount: {
                         type: Number,
                         required: true,
                         default: 0,
                    }
               }
          ],
          default: [],
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

// Performance indexes
supplierSchema.index({ firstName: 1, lastName: 1, isDeleted: 1 }); // Compound index for name searches
supplierSchema.index({ company: 1, isDeleted: 1 }); // For company filtering
supplierSchema.index({ createdAt: -1 }); // For date-based sorting
// Text index for full-text search
supplierSchema.index({ firstName: "text", lastName: "text", company: "text" });

// Virtual for full name
supplierSchema.virtual('fullName').get(function () {
     return `${this.firstName} ${this.lastName}`;
});

const Supplier = mongoose.model("Supplier", supplierSchema);

export default Supplier;