import "dotenv/config"; // Must be first to load env vars before other imports
import app from "./app.js";
import connectDB from "./config/db.js";
import { syncMasterIndexesSafe } from "./config/syncMasterIndexes.js";
import { runRbacSeed } from "./services/permissionSeedService.js";
import { warnIfMissingKey } from "./util/crypto.js";

// Default 8003 matches pragalbh-panel-fe/.env NEXT_PUBLIC_API when PORT is unset
const PORT = process.env.PORT || 8003;

async function start() {
  warnIfMissingKey();

  try {
    await connectDB();
  } catch (err) {
    console.error("Database connection failed — server not started:", err.message);
    process.exit(1);
  }

  try {
    await syncMasterIndexesSafe();
  } catch (err) {
    console.error("[Startup] Master index sync failed (continuing):", err.message);
  }

  try {
    await runRbacSeed();
  } catch (err) {
    console.error("[Startup] RBAC seed failed (continuing):", err.message);
  }

  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`❤️ Health: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error("Failed to bind HTTP server:", err.message);
    process.exit(1);
  }
}

start();
