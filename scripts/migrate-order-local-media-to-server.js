import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Order from "../src/models/order.js";
import {
  normalizeMediaRefToServerPath,
  normalizeRichTextMediaHtml,
} from "../src/util/mediaStorage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const connectDB = async () => {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing DATABASE_URL (or MONGODB_URI/MONGO_URI) in backend .env");
  await mongoose.connect(uri);
};

const run = async () => {
  await connectDB();
  let scanned = 0;
  let updatedOrders = 0;
  let migratedProductMedia = 0;
  let migratedOtherDetailsMedia = 0;

  try {
    const cursor = Order.find({}).cursor();
    for (let order = await cursor.next(); order != null; order = await cursor.next()) {
      scanned += 1;
      let changed = false;

      if (Array.isArray(order.products) && order.products.length > 0) {
        for (let pIdx = 0; pIdx < order.products.length; pIdx++) {
          const product = order.products[pIdx];
          if (!Array.isArray(product.productImages) || product.productImages.length === 0) continue;
          for (let i = 0; i < product.productImages.length; i++) {
            const current = product.productImages[i]?.img;
            const next = await normalizeMediaRefToServerPath(current, {
              baseName: `${String(product.productName || "product").slice(0, 30)}-${i + 1}`,
            });
            if (typeof current === "string" && next && next !== current) {
              product.productImages[i].img = next;
              migratedProductMedia += 1;
              changed = true;
            }
          }
        }
      }

      if (typeof order.otherDetails === "string" && /src=(["'])data:/i.test(order.otherDetails)) {
        const normalizedHtml = await normalizeRichTextMediaHtml(order.otherDetails, {
          baseName: "order-note",
        });
        if (normalizedHtml !== order.otherDetails) {
          const beforeMatches = (order.otherDetails.match(/src=(["'])data:/gi) || []).length;
          const afterMatches = (normalizedHtml.match(/src=(["'])data:/gi) || []).length;
          migratedOtherDetailsMedia += Math.max(0, beforeMatches - afterMatches);
          order.otherDetails = normalizedHtml;
          changed = true;
        }
      }

      if (changed) {
        await order.save();
        updatedOrders += 1;
      }
    }

    console.log("Migration complete.");
    console.log(`Orders scanned: ${scanned}`);
    console.log(`Orders updated: ${updatedOrders}`);
    console.log(`Product media migrated: ${migratedProductMedia}`);
    console.log(`Other details media migrated: ${migratedOtherDetailsMedia}`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
