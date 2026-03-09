
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Auth from "../src/models/auth.js"; // Adjust path if needed

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function checkUser() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("Connected.");

    const email = "sahil.pragalbhjewels@gmail.com";
    const user = await Auth.findOne({ email });

    if (user) {
      console.log(`User found: ${user.email}`);
      console.log(`Role ID: ${user.roleId}`);
      console.log(`Active: ${user.isActive}`);
    } else {
      console.log(`User NOT found: ${email}`);
    }

    // List all users
    const users = await Auth.find({}, "email isActive roleId otpLockedUntil");
    console.log("\nAll Users:");
    users.forEach(u => {
      console.log(`- ${u.email}`);
      console.log(`  Active: ${u.isActive}`);
      if (u.otpLockedUntil) {
        console.log(`  LOCKED Until: ${u.otpLockedUntil}`);
        if (u.otpLockedUntil > new Date()) console.log("  (Currently Locked)");
      }
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

checkUser();
