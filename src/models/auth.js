import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const crmAccessSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    accessMode: { type: String, enum: ["all", "selected"], default: "selected" },
    allowedCustomerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    invitationStatus: {
      type: String,
      enum: ["none", "pending", "accepted", "expired"],
      default: "none",
    },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", default: null },
    inviteTokenHash: { type: String, default: null },
    inviteExpiresAt: { type: Date, default: null },
    lastInvitedEmail: { type: String, trim: true, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { _id: false }
);

const authSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: "" },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: Number,
    enum: [1, 2],
    default: 1
  },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role", default: null },
  customPermissions: [{ type: String, trim: true }],
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  otpLockedUntil: { type: Date, default: null },
  crmAccess: { type: crmAccessSchema, default: () => ({}) },
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Hash password before saving
authSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
authSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Auth = mongoose.model("Auth", authSchema);

export default Auth;

