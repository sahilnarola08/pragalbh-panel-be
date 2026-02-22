import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/allrouts.js";
import { startSchedulers } from "./services/schedulerService.js";
import compression from "compression";
import cacheMiddleware from "./middlewares/cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Trust proxy (important behind nginx / reverse proxy)
app.set("trust proxy", true);

// Disable ETag
app.set("etag", false);

/* ===========================
   ✅ PROPER CORS CONFIGURATION
=========================== */

const allowedOrigins = [
  "http://localhost:3000",
  "https://pragalbh-panel.vercel.app",
  "https://pragalbh-panel-staging.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (mobile apps, postman, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Handle preflight requests
app.options("*", cors());

/* ===========================
   MIDDLEWARE
=========================== */

app.use(
  compression({
    level: 6,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Disable caching
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.removeHeader("ETag");
  next();
});

// Cache middleware
app.use(cacheMiddleware);

// Static files
app.use("/images", express.static(path.join(__dirname, "../uploads/images")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
routes(app);

// Start schedulers
startSchedulers();

/* ===========================
   GLOBAL ERROR HANDLER
=========================== */

app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  if (error.name === "MulterError") {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB.",
        status: 400,
        data: null,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "File upload error",
      status: 400,
      data: null,
    });
  }

  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    status: error.status || 500,
    data: null,
  });
});

export default app;
