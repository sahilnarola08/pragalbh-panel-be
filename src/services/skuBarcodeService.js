import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKU_MEDIA_DIR = path.join(__dirname, "../../uploads/sku-codes");

async function ensureDir() {
  await fs.mkdir(SKU_MEDIA_DIR, { recursive: true });
}

/**
 * Generate QR (PNG) and a simple barcode-style label image for a SKU.
 */
export async function generateSkuMedia(skuCode) {
  await ensureDir();
  const safeName = skuCode.replace(/[^A-Z0-9-]/gi, "_");
  const qrPath = path.join(SKU_MEDIA_DIR, `${safeName}-qr.png`);
  const barcodePath = path.join(SKU_MEDIA_DIR, `${safeName}-barcode.png`);

  await QRCode.toFile(qrPath, skuCode, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });

  const labelSvg = `
    <svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="200" y="45" font-family="monospace" font-size="14" text-anchor="middle" fill="#111">${skuCode}</text>
      ${Array.from({ length: Math.min(skuCode.length, 40) })
        .map((_, i) => {
          const h = 20 + (skuCode.charCodeAt(i % skuCode.length) % 25);
          return `<rect x="${20 + i * 9}" y="60" width="6" height="${h}" fill="#000"/>`;
        })
        .join("")}
      <text x="200" y="110" font-family="Arial" font-size="10" text-anchor="middle" fill="#444">PRAGALBH JEWELS</text>
    </svg>`;

  await sharp(Buffer.from(labelSvg)).png().toFile(barcodePath);

  return {
    qrCodePath: `/uploads/sku-codes/${safeName}-qr.png`,
    barcodePath: `/uploads/sku-codes/${safeName}-barcode.png`,
  };
}

export function getSkuMediaAbsolute(relativePath) {
  if (!relativePath) return null;
  const rel = relativePath.replace(/^\/uploads\//, "");
  return path.join(__dirname, "../../uploads", rel);
}
