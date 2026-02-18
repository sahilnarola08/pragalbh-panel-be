import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";

const envFile = process.env.NODE_ENV === 'production' ? 'env.prod' : 
                process.env.NODE_ENV === 'staging' ? 'env.staging' : 'env.dev';
dotenv.config({ path: envFile });

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB().catch((err) => {
    console.error("MongoDB connection failed:", err.message);
  });
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}`);
  });
}

start();