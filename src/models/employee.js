import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    docType: {
      type: String,
      enum: ["ID_PROOF", "ADDRESS_PROOF", "CONTRACT", "BANK", "KYC", "CERTIFICATE", "OTHER"],
      default: "OTHER",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, trim: true, default: "" },
    expiryDate: { type: Date, default: null, index: true },
    notes: { type: String, trim: true, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    joiningDate: { type: Date, default: null },
    salary: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    documents: { type: [documentSchema], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

employeeSchema.index({ department: 1, status: 1, isDeleted: 1 });

const Employee = mongoose.model("Employee", employeeSchema);
export default Employee;
