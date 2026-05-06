import { createRequire } from "module";
import sharp from "sharp";
import {
  fetchOrdersForReport,
  flattenReportRows,
  fetchImageBuffer,
} from "./orderDailyReportCommon.js";

const require = createRequire(import.meta.url);
const PdfPrinter = require("pdfmake");
const vfsFonts = require("pdfmake/build/vfs_fonts.js");

const ROBOTO_VFS_KEYS = [
  ["normal", "Roboto-Regular.ttf"],
  ["bold", "Roboto-Medium.ttf"],
  ["italics", "Roboto-Italic.ttf"],
  ["bolditalics", "Roboto-MediumItalic.ttf"],
];

/** Build Roboto descriptors from vfs (base64 in pdfmake vfs bundle). */
function buildFontsFromVfs() {
  /** @type {Record<string, Buffer>} */
  const roboto = {};
  for (const [style, vfsKey] of ROBOTO_VFS_KEYS) {
    const b64 = vfsFonts[vfsKey];
    if (!b64 || typeof b64 !== "string") {
      throw new Error(`pdfmake vfs missing font ${vfsKey}`);
    }
    roboto[style] = Buffer.from(b64, "base64");
  }
  return { Roboto: roboto };
}

const FONT_DESCRIPTORS = buildFontsFromVfs();
const printer = new PdfPrinter(FONT_DESCRIPTORS);

function truncate(s, max) {
  if (s == null) return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function rowFill(dd) {
  if (dd?.level === "orange") return "#FFF3E0";
  if (dd?.level === "red") return "#FFEBEE";
  return null;
}

function toJpegDataUri(buf) {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/**
 * pdfmake / PDFKit embed JPEG reliably; WebP and odd formats are normalized here.
 * @returns {Promise<{ buffer: Buffer } | null>}
 */
async function rasterizeForPdf(input) {
  try {
    const out = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: 220,
        height: 220,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return out.length > 50 ? { buffer: out } : null;
  } catch {
    return null;
  }
}

/** Fetch + rasterize for PDF (deduped URLs, parallel). */
async function prefetchPdfImagesByUrl(rows, concurrency = 14) {
  const urls = [...new Set(rows.map((r) => r.imageUrl).filter(Boolean))];
  /** @type {Map<string, { buffer: Buffer } | null | undefined>} */
  const out = new Map();
  for (const u of urls) out.set(u, undefined);
  const queue = urls.slice();

  async function worker() {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) continue;
      try {
        const raw = await fetchImageBuffer(u);
        if (!raw || raw.length < 50) {
          out.set(u, null);
          continue;
        }
        const raster = await rasterizeForPdf(raw);
        out.set(u, raster);
      } catch {
        out.set(u, null);
      }
    }
  }

  const n = urls.length === 0 ? 0 : Math.min(concurrency, urls.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * @returns {Promise<Buffer>}
 */
export async function buildDailyOrdersStatusReportPdfBuffer() {
  const orders = await fetchOrdersForReport({ ongoingPreDispatchOnly: true });
  const rows = flattenReportRows(orders);
  const now = new Date();

  let orangeCount = 0;
  let redCount = 0;
  for (const r of rows) {
    if (r.dd.level === "orange") orangeCount += 1;
    if (r.dd.level === "red") redCount += 1;
  }

  const imageBuffers = await prefetchPdfImagesByUrl(rows);

  /** @type {unknown[][]} */
  const tableBody = [];

  tableBody.push([
    { text: "Delay", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Order ID", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Status", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Product", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Platform", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Order date", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Dispatch date", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    { text: "Supplier", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
    {
      text: "Other details",
      bold: true,
      fillColor: "#E0E0E0",
      fontSize: 8,
    },
    { text: "Photo", bold: true, fillColor: "#E0E0E0", fontSize: 8 },
  ]);

  for (const row of rows) {
    const fill = rowFill(row.dd);
    const baseText = {
      fontSize: 7,
      margin: [2, 3, 2, 3],
      ...(fill ? { fillColor: fill } : {}),
    };

    /** @type {Record<string, unknown>} */
    let photoCell = { text: "—", alignment: "center", ...baseText, fontSize: 8 };
    if (row.imageUrl) {
      const packed = imageBuffers.get(row.imageUrl);
      const buf = packed?.buffer;
      if (buf && buf.length > 50) {
        try {
          photoCell = {
            stack: [
              {
                image: toJpegDataUri(buf),
                fit: [48, 48],
                alignment: "center",
              },
            ],
            margin: [2, 4, 2, 4],
            ...(fill ? { fillColor: fill } : {}),
          };
        } catch {
          photoCell = {
            text: "—",
            alignment: "center",
            ...baseText,
          };
        }
      }
    }

    tableBody.push([
      {
        text: row.dd.label || "—",
        ...baseText,
        color: row.dd.level === "red" ? "#B71C1C" : row.dd.level === "orange" ? "#E65100" : "#424242",
        bold: !!(row.dd.label && row.dd.level),
      },
      { text: row.orderId || "—", ...baseText },
      { text: truncate(row.statusLabel, 56), ...baseText },
      { text: truncate(row.productName, 160), ...baseText },
      { text: truncate(row.platform, 40), ...baseText },
      { text: row.orderDateStr || "—", ...baseText },
      { text: row.dispatchDateStr || "—", ...baseText },
      { text: truncate(row.supplier, 140), ...baseText },
      { text: truncate(row.other, 400), ...baseText },
      photoCell,
    ]);
  }

  const printedAt = now.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const pdfContent = [];
  if (rows.length === 0) {
    pdfContent.push({
      text:
        "No product lines are currently in workflow before Dispatch. Orders in Dispatch, Tracking, Delivery, Review, or Done are excluded.",
      italics: true,
      fontSize: 9,
      color: "#616161",
      margin: [0, 12, 0, 16],
    });
  } else {
    pdfContent.push({
      columns: [
        {
          width: "*",
          text: [
            { text: "Summary: ", bold: true },
            {
              text: `${orangeCount} line(s) within 3 days of dispatch deadline `,
              color: "#E65100",
            },
            { text: " · ", color: "#424242" },
            {
              text: `${redCount} due today / late`,
              color: "#B71C1C",
            },
          ],
          fontSize: 8,
          margin: [0, 0, 0, 8],
        },
        {
          width: 148,
          table: {
            widths: [72, "*"],
            body: [
              [
                { fillColor: "#FFF3E0", text: " ", margin: [2, 6] },
                {
                  stack: [{ text: "≤3 days to deadline", fontSize: 7, bold: true }],
                  fillColor: "#FFF3E0",
                },
              ],
              [
                { fillColor: "#FFEBEE", text: " ", margin: [2, 6] },
                {
                  stack: [{ text: "Due today / late", fontSize: 7, bold: true }],
                  fillColor: "#FFEBEE",
                },
              ],
            ],
          },
          layout: "noBorders",
          margin: [0, 0, 0, 8],
        },
      ],
    });
    pdfContent.push({
      table: {
        headerRows: 1,
        dontBreakRows: false,
        widths: [48, 50, "auto", 88, 52, 48, 50, "*", "*", 58],
        body: tableBody,
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => "#BDBDBD",
        vLineColor: () => "#BDBDBD",
        paddingLeft: () => 1,
        paddingRight: () => 1,
      },
    });
  }

  const docDefinition = {
    info: {
      title: "Ongoing orders (pre-Dispatch)",
      author: "Pragalbh Panel",
      subject: `Pre-Dispatch snapshot ${printedAt}`,
    },
    pageOrientation: "landscape",
    pageSize: "A4",
    pageMargins: [28, 46, 28, 40],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    header: (_currentPage, _pageCount) => ({
      margin: [28, 16, 28, 6],
      columns: [
        {
          width: "*",
          stack: [
            { text: "Ongoing orders (before Dispatch)", fontSize: 13, bold: true },
            {
              text: `Only statuses: Over Due, Dispute, Stock, Pending, Factory, Video confirmation · Lines: ${rows.length} · Generated: ${printedAt}`,
              fontSize: 8,
              color: "#616161",
            },
          ],
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: "#757575",
      margin: [0, 8, 0, 8],
    }),
    content: pdfContent,
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  /** @type {Buffer[]} */
  const chunks = [];
  return await new Promise((resolve, reject) => {
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("error", reject);
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.end();
  });
}
