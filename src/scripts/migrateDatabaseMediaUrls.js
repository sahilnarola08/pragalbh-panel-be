/**
 * Rewrites legacy /images/ and /uploads/ media URLs in MongoDB to Supabase public URLs.
 *
 * Usage:
 *   node src/scripts/migrateDatabaseMediaUrls.js --dry-run
 *   node src/scripts/migrateDatabaseMediaUrls.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/product.js";
import Order from "../models/order.js";
import Stock from "../models/stock.js";
import Sku from "../models/sku.js";
import { storageConfig } from "../config/storage.js";
import { migrateMediaUrl, migrateHtmlMediaUrls } from "../services/storage/legacyMediaUrl.js";

const dryRun = process.argv.includes("--dry-run");

function migrateImageList(images) {
  if (!Array.isArray(images)) return { next: images, changed: false };
  let changed = false;
  const next = images.map((item) => {
    if (!item || typeof item !== "object") return item;
    const current = typeof item.img === "string" ? item.img : "";
    const migrated = migrateMediaUrl(current);
    if (migrated !== current) changed = true;
    return migrated === current ? item : { ...item, img: migrated };
  });
  return { next, changed };
}

async function migrateProducts() {
  const products = await Product.find({
    $or: [
      { "imageURLs.img": { $regex: /\/images\/|pragalbhpanel\.pragalbhjewels\.com|localhost:\d+\/images\//i } },
    ],
  }).lean();

  let updated = 0;
  for (const product of products) {
    const { next, changed } = migrateImageList(product.imageURLs);
    if (!changed) continue;
    updated += 1;
    if (dryRun) {
      console.log(`[dry-run] product ${product._id} (${product.productName})`);
      continue;
    }
    await Product.updateOne({ _id: product._id }, { $set: { imageURLs: next } });
    console.log(`Updated product: ${product.productName || product._id}`);
  }
  return updated;
}

async function migrateOrders() {
  const orders = await Order.find({
    $or: [
      { "products.productImages.img": { $regex: /\/images\/|pragalbhpanel\.pragalbhjewels\.com|localhost:\d+\/images\//i } },
      { otherDetails: { $regex: /\/images\/|pragalbhpanel\.pragalbhjewels\.com|localhost:\d+\/images\//i } },
    ],
  }).lean();

  let updated = 0;
  for (const order of orders) {
    let changed = false;
    const products = Array.isArray(order.products)
      ? order.products.map((product) => {
          const { next, changed: imagesChanged } = migrateImageList(product.productImages);
          if (imagesChanged) changed = true;
          return imagesChanged ? { ...product, productImages: next } : product;
        })
      : order.products;

    let otherDetails = order.otherDetails || "";
    const migratedDetails = migrateHtmlMediaUrls(otherDetails);
    if (migratedDetails !== otherDetails) {
      changed = true;
      otherDetails = migratedDetails;
    }

    if (!changed) continue;
    updated += 1;
    if (dryRun) {
      console.log(`[dry-run] order ${order.orderId || order._id}`);
      continue;
    }
    await Order.updateOne(
      { _id: order._id },
      { $set: { products, otherDetails } }
    );
    console.log(`Updated order: ${order.orderId || order._id}`);
  }
  return updated;
}

async function migrateStocks() {
  const stocks = await Stock.find({
    productImages: { $elemMatch: { img: { $regex: /\/images\/|pragalbhpanel\.pragalbhjewels\.com|localhost:\d+\/images\//i } } },
  }).lean();

  let updated = 0;
  for (const stock of stocks) {
    const { next, changed } = migrateImageList(stock.productImages);
    if (!changed) continue;
    updated += 1;
    if (dryRun) {
      console.log(`[dry-run] stock ${stock._id}`);
      continue;
    }
    await Stock.updateOne({ _id: stock._id }, { $set: { productImages: next } });
    console.log(`Updated stock: ${stock._id}`);
  }
  return updated;
}

async function migrateSkus() {
  const skus = await Sku.find({
    productImagePath: { $regex: /\/images\/|pragalbhpanel\.pragalbhjewels\.com|localhost:\d+\/images\//i },
  }).lean();

  let updated = 0;
  for (const sku of skus) {
    const migrated = migrateMediaUrl(sku.productImagePath || "");
    if (!migrated || migrated === sku.productImagePath) continue;
    updated += 1;
    if (dryRun) {
      console.log(`[dry-run] sku ${sku.skuCode || sku._id}`);
      continue;
    }
    await Sku.updateOne({ _id: sku._id }, { $set: { productImagePath: migrated } });
    console.log(`Updated sku: ${sku.skuCode || sku._id}`);
  }
  return updated;
}

async function main() {
  if (!storageConfig.supabase.url) {
    throw new Error("SUPABASE_URL is missing in .env");
  }

  const dbUrl = process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  console.log(dryRun ? "Starting DB URL dry-run..." : "Starting DB URL migration...");
  await mongoose.connect(dbUrl);

  const [products, orders, stocks, skus] = await Promise.all([
    migrateProducts(),
    migrateOrders(),
    migrateStocks(),
    migrateSkus(),
  ]);

  console.log("\nDB migration summary:");
  console.log(`Products updated: ${products}`);
  console.log(`Orders updated: ${orders}`);
  console.log(`Stocks updated: ${stocks}`);
  console.log(`SKUs updated: ${skus}`);
  console.log(`Total updated: ${products + orders + stocks + skus}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("DB migration failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
