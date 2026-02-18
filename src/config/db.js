import mongoose from "mongoose";
import dns from "node:dns";

/**
 * Optimized MongoDB Connection with Connection Pooling
 * Reduces database connection overhead and improves performance
 */
const connectDB = async () => {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.error(
      "MongoDB: DATABASE_URL is missing or empty in .env. Add DATABASE_URL=your_mongodb_connection_string"
    );
    return;
  }

  try {
    // Fix querySrv ECONNREFUSED on Windows/some networks: use public DNS for SRV lookup
    if (url.startsWith("mongodb+srv://")) {
      dns.setServers(["1.1.1.1", "8.8.8.8"]);
    }

    // Allow buffered operations to wait longer for (re)connection (default 10s was too short)
    mongoose.set("bufferTimeoutMS", 30000);

    const options = {
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2, // Lower min to avoid long startup when DB is slow
      maxIdleTimeMS: 30000,

      // Give initial connection and server selection more time (e.g. Atlas cold start)
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,

      retryWrites: true,
      retryReads: true,
    };

    await mongoose.connect(url, options);
    
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
    if (error.message && error.message.includes("querySrv")) {
      console.warn(
        "DNS SRV lookup failed. Try: (1) Different network/VPN, (2) In Atlas use Connect → Drivers → 'Edit connection string' and choose Standard (non-SRV) format, set as DATABASE_URL."
      );
    }
    console.warn(
      "Server will start without DB. Fix MongoDB (unpause Atlas cluster, check DATABASE_URL, network, IP whitelist) then restart. Routes that need DB will return errors until then."
    );
    // Don't throw - allow server to start so other features (e.g. metal rates) still work
  }
};

export default connectDB;