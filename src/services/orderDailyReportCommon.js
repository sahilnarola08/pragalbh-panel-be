import Order from "../models/order.js";

/** Match Order Management: no deadline highlight once in Dispatch or later. */
export const DISPATCH_AND_AFTER = new Set([
  "dispatch",
  "updated_tracking_id",
  "delivery_confirmation",
  "review",
  "done",
]);

/** Kanban columns before Dispatch — work not yet in the ship/dispatch stage. */
export const PRE_DISPATCH_STATUSES = [
  "over_due",
  "with_dispute",
  "stock",
  "pending",
  "factory_process",
  "video_confirmation",
];

export const STATUS_LABELS = {
  over_due: "Over Due",
  with_dispute: "With Dispute",
  stock: "Stock",
  pending: "Pending Order",
  factory_process: "Factory Process",
  video_confirmation: "Video Confirmation",
  dispatch: "Dispatch",
  updated_tracking_id: "Updated Tracking ID",
  delivery_confirmation: "Delivery Confirmation",
  review: "Review",
  done: "Done",
};

export function formatDMY(value) {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** @returns {{ level: 'orange' | 'red' | null, label: string }} */
export function deadlineInfo(status, dispatchDate) {
  const s = String(status || "").trim();
  if (!s || DISPATCH_AND_AFTER.has(s)) return { level: null, label: "" };
  if (!dispatchDate) return { level: null, label: "" };
  const deadline = new Date(dispatchDate);
  if (Number.isNaN(deadline.getTime())) return { level: null, label: "" };
  const days = Math.round(
    (startOfLocalDay(deadline) - startOfLocalDay(new Date())) / 86400000
  );
  if (days < 0) return { level: "red", label: `${Math.abs(days)}d late` };
  if (days === 0) return { level: "red", label: "Due today" };
  if (days <= 3) return { level: "orange", label: `${days}d left` };
  return { level: null, label: "" };
}

export function stripHtml(html) {
  if (html == null || html === "") return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function platformName(p) {
  const v = p?.orderPlatform;
  if (!v) return "";
  if (typeof v === "string") return v;
  return v?.name || "";
}

export function firstProductImageUrl(product) {
  const imgs = product?.productImages;
  if (!Array.isArray(imgs) || imgs.length === 0) return "";
  const first = imgs.find((x) => x?.img && String(x.img).trim());
  return first?.img ? String(first.img).trim() : "";
}

export function supplierForProductLine(order, product) {
  const lines = product?.purchaseSupplierLines;
  if (Array.isArray(lines) && lines.length > 0) {
    const names = [
      ...new Set(
        lines
          .map((l) => String(l?.supplierName || "").trim())
          .filter(Boolean)
      ),
    ];
    if (names.length) return names.join(", ");
  }
  return order?.supplier ? String(order.supplier).trim() : "";
}

export function imageExtensionFromUrl(url) {
  const l = String(url).toLowerCase();
  if (l.includes(".png")) return "png";
  if (l.includes(".gif")) return "gif";
  if (l.includes(".webp")) return "webp";
  return "jpeg";
}

export async function fetchImageBuffer(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u.startsWith("http")) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(u, { signal: controller.signal });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > 3_000_000) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ ongoingPreDispatchOnly?: boolean }} [options] If true, only orders still before the Dispatch column.
 */
export async function fetchOrdersForReport(options = {}) {
  const { ongoingPreDispatchOnly = false } = options;
  const filter = { isDeleted: false };
  if (ongoingPreDispatchOnly) {
    filter.status = { $in: PRE_DISPATCH_STATUSES };
  }
  return Order.find(filter)
    .select("orderId status supplier otherDetails products")
    .populate({
      path: "products.orderPlatform",
      select: "name",
      match: { isDeleted: false },
    })
    .sort({ updatedAt: -1 })
    .lean();
}

/**
 * @returns {Array<{
 *   dd: { level: string | null, label: string },
 *   orderId: string,
 *   statusLabel: string,
 *   productName: string,
 *   platform: string,
 *   orderDateStr: string,
 *   dispatchDateStr: string,
 *   supplier: string,
 *   other: string,
 *   imageUrl: string
 * }>}
 */
export function flattenReportRows(orders) {
  const rows = [];
  for (const order of orders) {
    const products = Array.isArray(order.products) ? order.products : [];
    const statusKey = order.status || "";
    const statusLabel = STATUS_LABELS[statusKey] || statusKey || "—";
    const other = stripHtml(order.otherDetails || "");

    if (products.length === 0) {
      const dd = deadlineInfo(statusKey, null);
      rows.push({
        dd,
        orderId: order.orderId || "",
        statusLabel,
        productName: "",
        platform: "",
        orderDateStr: "",
        dispatchDateStr: "",
        supplier: order?.supplier ? String(order.supplier).trim() : "",
        other,
        imageUrl: "",
      });
      continue;
    }

    for (const product of products) {
      const dd = deadlineInfo(statusKey, product?.dispatchDate);
      rows.push({
        dd,
        orderId: order.orderId || "",
        statusLabel,
        productName: product?.productName || "",
        platform: platformName(product),
        orderDateStr: formatDMY(product?.orderDate),
        dispatchDateStr: formatDMY(product?.dispatchDate),
        supplier: supplierForProductLine(order, product),
        other,
        imageUrl: firstProductImageUrl(product),
      });
    }
  }
  return rows;
}
