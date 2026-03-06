import "dotenv/config"; // Must be first to load env vars before other imports
import app from "./app.js";
import connectDB from "./config/db.js";
import { runRbacSeed } from "./services/permissionSeedService.js";

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await runRbacSeed();
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`❤️ Health: http://localhost:${PORT}/health`);
    });

  } catch (err) {
    console.error("Startup error:", err.message);
    console.error("Startup error:", err);
  }
}

start();
