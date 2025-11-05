import mongoose from "mongoose";

const platformSchema = new mongoose.Schema({
     platformName: {
       type: String,
       required: true,
       trim: true
     },
     platformUsername: {
       type: String,     
       trim: true
     }
   }, { _id: false });
   

const userSchema = new mongoose.Schema({
     firstName: {
          type: String,
          required: [true, 'First name is required'],
          trim: true,
          index: true,
     },
     lastName: {
          type: String,
          required: [true, 'Last name is required'],
          trim: true,
          index: true,
     },
     address: {
          type: String,
          trim: true,
     },
     contactNumber: {
          type: String,
          trim: true,
          unique: true,
          index: true,
     },
     platforms: [platformSchema],
     company: {
          type: String,
          trim: true,
          index: true,
     },
     email: {
          type: String,
          trim: true,
          unique: true,
          index: true,
     },
     clientType: {
          type: String,
          trim: true,
          index: true,
     },
     isDeleted: {
          type: Boolean,
          default: false,
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
const User = mongoose.model("User", userSchema);

export default User;
