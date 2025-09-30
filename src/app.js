import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import routes from "./routes/allrouts.js";
import { startSchedulers } from "./services/schedulerService.js";

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? 'env.prod' : 
                process.env.NODE_ENV === 'staging' ? 'env.staging' : 'env.dev';
dotenv.config({ path: envFile });

const app = express();

// Connect to database
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        status: error.status || 500,
        data: null
    });
});

export default app;