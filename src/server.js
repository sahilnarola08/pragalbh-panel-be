import "./loadEnv.js";
import app from "./app.js";
import connectDB from "./config/db.js";

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