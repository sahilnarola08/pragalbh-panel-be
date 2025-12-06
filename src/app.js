import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import routes from "./routes/allrouts.js";
import { startSchedulers } from "./services/schedulerService.js";
import compression from "compression";
import cacheMiddleware from "./middlewares/cache.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? 'env.prod' : 
                process.env.NODE_ENV === 'staging' ? 'env.staging' : 'env.dev';
dotenv.config({ path: envFile });

const app = express();

// Trust proxy - important for reading x-forwarded-* headers behind reverse proxy/load balancer
app.set('trust proxy', true);

// Connect to database
connectDB();

// Middleware
app.use(cors());

// Compression middleware - reduces response size by ~70%
app.use(compression({
  level: 6, // Compression level (1-9, 6 is a good balance)
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all other requests
    return compression.filter(req, res);
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cache middleware - must be before routes
app.use(cacheMiddleware);

// Serve static files (uploaded images)
app.use(
  "/images",
  express.static(path.join(__dirname, "../uploads/images"))
);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
routes(app);

// order Schedulers services 
startSchedulers();

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    // Handle multer errors
    if (error.name === 'MulterError') {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB.',
                status: 400,
                data: null
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message || 'File upload error',
            status: 400,
            data: null
        });
    }
    
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        status: error.status || 500,
        data: null
    });
});

export default app;