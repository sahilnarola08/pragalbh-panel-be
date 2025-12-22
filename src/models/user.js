import mongoose from "mongoose";

const platformSchema = new mongoose.Schema({
     platformName: {
       type: mongoose.Schema.Types.ObjectId,
       ref: "master",
       required: true,
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
     // Allow multiple client types (multi-select)
     clientType: [
          {
               type: mongoose.Schema.Types.ObjectId,
               ref: "master",
          }
     ],
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
userSchema.index({ firstName: 1, lastName: 1, isDeleted: 1 }); // Compound index for name searches
userSchema.index({ clientType: 1, isDeleted: 1 }); // For client type filtering
userSchema.index({ createdAt: -1 }); // For date-based sorting
// Text index for full-text search (MongoDB text search)
userSchema.index({ firstName: "text", lastName: "text", company: "text" });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
     return `${this.firstName} ${this.lastName}`;
});
const User = mongoose.model("User", userSchema);

export default User;
