import "./loadEnv.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import { runRbacSeed } from "./services/permissionSeedService.js";

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";   // REQUIRED for server / pm2 / docker / CI

async function start() {
  try {
    console.log("Starting server...");
    console.log("ENV PORT:", process.env.PORT);

    // Connect DB
    await connectDB();
    console.log("MongoDB Connected");

    // Seed (ignore error in prod)
    await runRbacSeed().catch(() => {});

    // Start server
    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
    });

  } catch (err) {
    console.error("❌ Startup Error:", err.message);
    process.exit(1);
  }
}
//start
start();
