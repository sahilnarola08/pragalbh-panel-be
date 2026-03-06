
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

console.log("Testing email configuration...");
console.log("Service:", process.env.SERVICE);
console.log("User:", process.env.EMAIL_USER);
console.log("Pass Length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

const transporter = nodemailer.createTransport({
  service: process.env.SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function run() {
  try {
    console.log("Sending email...");
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "sahil.pragalbhjewels@gmail.com",
      subject: "Test Email Debug",
      text: "This is a test email.",
    });
    console.log("Success:", info.messageId);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
