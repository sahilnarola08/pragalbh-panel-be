import ExcelJS from "exceljs";
import {
  fetchOrdersForReport,
  flattenReportRows,
  fetchImageBuffer,
  imageExtensionFromUrl,
} from "./orderDailyReportCommon.js";

const FILL_ORANGE = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } };
const FILL_RED = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEBEE" } };

/**
 * One row per product line. Embeds thumbnail when URL fetch succeeds.
 * @returns {Promise<Buffer>}
 */
export async function buildDailyOrdersStatusReportBuffer() {
  const orders = await fetchOrdersForReport();
  const flatRows = flattenReportRows(orders);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pragalbh Panel";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Orders", {
    properties: { defaultRowHeight: 16 },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { key: "delay", width: 12 },
    { key: "orderId", width: 14 },
    { key: "status", width: 22 },
    { key: "productName", width: 28 },
    { key: "platform", width: 16 },
    { key: "orderDate", width: 12 },
    { key: "dispatchDate", width: 12 },
    { key: "supplier", width: 22 },
    { key: "otherDetails", width: 40 },
    { key: "photoNote", width: 14 },
  ];

  const headers = [
    "Delay alert",
    "Order ID",
    "Status",
    "Product name",
    "Platform",
    "Order date",
    "Dispatch date",
    "Supplier name",
    "Other details",
    "Product photo",
  ];
  const headerRow = sheet.getRow(1);
  headers.forEach((text, i) => {
    headerRow.getCell(i + 1).value = text;
  });
  headerRow.font = { bold: true };
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFBDBDBD" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  let excelRowIndex = 2;

  for (const r of flatRows) {
    const { dd, orderId, statusLabel, productName, platform, orderDateStr, dispatchDateStr, supplier, other, imageUrl } =
      r;

    const row = sheet.getRow(excelRowIndex);
    const rowCells = [
      dd.label || "",
      orderId || "",
      statusLabel,
      productName || "",
      platform || "",
      orderDateStr || "",
      dispatchDateStr || "",
      supplier || "",
      other || "",
      "",
    ];
    rowCells.forEach((v, i) => {
      row.getCell(i + 1).value = v;
    });
    row.height = imageUrl ? 72 : undefined;
    row.alignment = { vertical: "top", wrapText: true };

    const fill =
      dd.level === "orange" ? FILL_ORANGE : dd.level === "red" ? FILL_RED : null;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
      if (fill) cell.fill = fill;
    });

    if (imageUrl) {
      let embedded = false;
      const buf = await fetchImageBuffer(imageUrl);
      if (buf) {
        try {
          const ext = imageExtensionFromUrl(imageUrl);
          const id = workbook.addImage({ buffer: buf, extension: ext });
          sheet.addImage(id, {
            tl: { col: 9, row: excelRowIndex - 1 },
            ext: { width: 96, height: 96 },
          });
          embedded = true;
        } catch {
          // fall through to link
        }
      }
      if (!embedded) {
        const c = row.getCell(10);
        c.value = { text: "Open photo", hyperlink: imageUrl, tooltip: imageUrl };
        c.font = { color: { argb: "FF1565C0" }, underline: true };
      }
    }

    excelRowIndex += 1;
  }

  /** @type {Buffer} */
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
