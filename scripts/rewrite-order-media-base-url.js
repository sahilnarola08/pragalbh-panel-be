import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Order from "../src/models/order.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SOURCE_BASE = (process.env.MEDIA_SOURCE_BASE_URL || "http://localhost:8003").replace(/\/+$/, "");
const TARGET_BASE = (process.env.MEDIA_TARGET_BASE_URL || "https://pragalbhpanel.pragalbhjewels.com").replace(/\/+$/, "");

const connectDB = async () => {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing DATABASE_URL (or MONGODB_URI/MONGO_URI) in backend .env");
  await mongoose.connect(uri);
};

const rewriteUrl = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Rewrite only URLs with source base
  if (trimmed.startsWith(`${SOURCE_BASE}/`)) {
    return `${TARGET_BASE}${trimmed.slice(SOURCE_BASE.length)}`;
  }

  // Keep relative media path, but convert to target absolute URL
  if (trimmed.startsWith("/images/") || trimmed.startsWith("/uploads/")) {
    return `${TARGET_BASE}${trimmed}`;
  }

  return trimmed;
};

const rewriteHtmlSources = (html) => {
  if (typeof html !== "string" || !html.trim()) return html || "";
  return html.replace(/src=(["'])([^"']+)\1/gi, (full, quote, src) => {
    const next = rewriteUrl(src);
    if (next === src) return full;
    return `src=${quote}${next}${quote}`;
  });
};

const run = async () => {
  await connectDB();
  let scanned = 0;
  let updatedOrders = 0;
  let updatedProductUrls = 0;
  let updatedOtherDetailsUrls = 0;

  try {
    const cursor = Order.find({}).cursor();
    for (let order = await cursor.next(); order != null; order = await cursor.next()) {
      scanned += 1;
      let changed = false;

      if (Array.isArray(order.products)) {
        for (const product of order.products) {
          if (!Array.isArray(product.productImages)) continue;
          for (const image of product.productImages) {
            const current = image?.img;
            const next = rewriteUrl(current);
            if (typeof current === "string" && next !== current) {
              image.img = next;
              updatedProductUrls += 1;
              changed = true;
            }
          }
        }
      }

      if (typeof order.otherDetails === "string" && /src=(["'])(https?:\/\/|\/images\/|\/uploads\/)/i.test(order.otherDetails)) {
        const nextHtml = rewriteHtmlSources(order.otherDetails);
        if (nextHtml !== order.otherDetails) {
          const beforeCount = (order.otherDetails.match(/src=(["'])(https?:\/\/|\/images\/|\/uploads\/)/gi) || []).length;
          const afterCount = (nextHtml.match(new RegExp(`${TARGET_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")) || []).length;
          updatedOtherDetailsUrls += Math.min(beforeCount, afterCount);
          order.otherDetails = nextHtml;
          changed = true;
        }
      }

      if (changed) {
        await order.save();
        updatedOrders += 1;
      }
    }

    console.log("Rewrite complete.");
    console.log(`Source base: ${SOURCE_BASE}`);
    console.log(`Target base: ${TARGET_BASE}`);
    console.log(`Orders scanned: ${scanned}`);
    console.log(`Orders updated: ${updatedOrders}`);
    console.log(`Product image URLs rewritten: ${updatedProductUrls}`);
    console.log(`OtherDetails media URLs rewritten: ${updatedOtherDetailsUrls}`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error("Rewrite failed:", err);
  process.exit(1);
});
