
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

console.log("=== EMAIL DEBUG START ===");
console.log("Environment check:");
console.log("SERVICE:", process.env.SERVICE);
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS Length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);
console.log("EMAIL_PORT:", process.env.EMAIL_PORT);

async function testEmail() {
  try {
    // 1. Create Transporter (Matching authController.js)
    console.log("\n1. Creating Transporter...");
    const transporter = nodemailer.createTransport({
      service: process.env.SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      pool: true,
      maxConnections: 1,
      rateLimit: 1,
      logger: true, // Enable built-in logger
      debug: true   // Enable debug output
    });

    // 2. Verify Connection
    console.log("\n2. Verifying Connection...");
    await transporter.verify();
    console.log("✅ Connection Verified!");

    // 3. Send Email
    console.log("\n3. Sending Email to", process.env.EMAIL_USER);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "sahil.pragalbhjewels@gmail.com", // Sending to self as per user setup
      subject: "DEBUG: Pragalbh Panel Email Test " + new Date().toISOString(),
      text: "This is a debug email to verify the sending flow. If you receive this, the email configuration is correct.",
      html: "<p>This is a debug email to verify the sending flow. If you receive this, the email configuration is correct.</p>"
    });

    console.log("\n✅ Email Sent!");
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);

  } catch (error) {
    console.error("\n❌ ERROR:", error);
  }
  console.log("=== EMAIL DEBUG END ===");
}

testEmail();
