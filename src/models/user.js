import mongoose from "mongoose";

const platformSchema = new mongoose.Schema({
     platformName: {
       type: String,
       required: true,
       trim: true
     },
     platformUsername: {
       type: String,
       required: true,
       trim: true
     }
   }, { _id: false });
   

const userSchema = new mongoose.Schema({
     firstName: {
          type: String,
          required: [true, 'First name is required'],
          trim: true,
     },
     lastName: {
          type: String,
          required: [true, 'Last name is required'],
          trim: true,
     },
     address: {
          type: String,
          required: [true, 'Address is required'],
          trim: true,
     },
     contactNumber: {
          type: String,
          required: [true, 'Contact number is required'],
          trim: true,
     },
     platforms: [platformSchema],
     company: {
          type: String,
          required: [true, 'Company name is required'],
          trim: true,
     },
     email: {
          type: String,
          required: [true, 'Email is required'],
          trim: true,
          unique: true,
     },
}, {
     timestamps: true,
     toJSON: { virtuals: true },
     toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function () {
     return `${this.firstName} ${this.lastName}`;
});

// Index for better query performance
userSchema.index({ company: 1 });

const User = mongoose.model("User", userSchema);

export default User;
