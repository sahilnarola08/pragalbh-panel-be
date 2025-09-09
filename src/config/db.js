import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("MongoDB Connected to successfully");
  } catch (error) {
    console.error("MongoDB Error ", error.message);
    process.exit(1);
  }
};

export default connectDB;