import mongoose from "mongoose";

/**
 * Optimized MongoDB Connection with Connection Pooling
 * Reduces database connection overhead and improves performance
 */
const connectDB = async () => {
  try {
    const options = {
      // Connection pool settings
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 5, // Minimum number of connections in the pool
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Performance optimizations
      serverSelectionTimeoutMS: 5000, // How long to try selecting a server
      socketTimeoutMS: 45000, // How long to wait for a socket to be established
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
    };
    
    // Disable mongoose buffering (set globally, not in connection options)
    mongoose.set('bufferCommands', false);

    await mongoose.connect(process.env.DATABASE_URL, options);
    
    // Connection event handlers
    mongoose.connection.on('connected', () => {
      console.log(`MongoDB Connected successfully - Pool Size: ${mongoose.connection.readyState}`);
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

    console.log("MongoDB Connected successfully with optimized settings");
  } catch (error) {
    console.error("MongoDB Error:", error.message);
    console.warn(
      "Server will continue without DB. Live metal rates (gold/silver/platinum) will still work; other routes may fail until MongoDB is reachable (check DATABASE_URL, network, and Atlas IP whitelist)."
    );
    // Do not exit - coast rate endpoints use external APIs only and can work without DB
  }
};

export default connectDB;