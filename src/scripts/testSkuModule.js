/**
 * Smoke test for SKU generator (run: node src/scripts/testSkuModule.js)
 */
import "../loadDotenv.js";
import connectDB from "../config/db.js";
import {
  previewSku,
  generateSku,
  getDefaultTemplate,
} from "../services/skuGeneratorService.js";
import Sku from "../models/sku.js";

async function run() {
  await connectDB();
  await getDefaultTemplate();

  const attrs = {
    category: "RNG",
    metal: "18K",
    stone: "DIA",
    collection: "CLS",
    variant: "YG",
  };

  const preview = await previewSku(attrs);
  if (!preview.preview?.startsWith("PJ-")) {
    throw new Error(`Invalid preview: ${preview.preview}`);
  }
  console.log("✓ Preview:", preview.preview);

  const sku = await generateSku(attrs, {
    persist: true,
    productName: "Test SKU Smoke",
  });
  console.log("✓ Generated:", sku.skuCode);

  const dup = await Sku.findOne({ skuCode: sku.skuCode, isDeleted: false });
  if (!dup) throw new Error("SKU not found in DB");
  console.log("✓ DB unique index OK");

  await Sku.updateOne({ _id: sku._id }, { isDeleted: true });
  console.log("✓ Cleanup done");
  process.exit(0);
}

run().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
