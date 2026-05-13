/**
 * Shared invoice-message builder used by both WhatsApp and Telegram dispatch.
 * Both channels support markdown-style *bold* formatting, so the same body
 * works for both. Channel-specific behaviour (e.g. emoji, link previews) can
 * be added via the `channel` option later if needed.
 */

const BRAND_NAME = process.env.WHATSAPP_BRAND_NAME || "Pragalbh Jewels";

const formatINR = (amount) => {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatUSD = (amount) => {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

/**
 * Structured invoice data shared by WhatsApp/Telegram text and HTML email.
 * @param {object} order
 * @param {string} [customerName]
 * @param {{ brandName?: string }} [opts]
 */
export const buildOrderInvoiceContext = (
  order,
  customerName,
  { brandName = BRAND_NAME } = {},
) => {
  const greetingName = (customerName || order?.clientName || "Customer").trim();
  const orderId = order?.orderId || order?._id || "—";
  const createdAt = order?.createdAt || new Date();
  const products = Array.isArray(order?.products) ? order.products : [];

  let inrSubtotal = 0;
  let usdSubtotal = 0;

  const items = products.map((p, idx) => {
    const price = Number(p?.sellingPrice) || 0;
    const currency = p?.paymentCurrency === "USD" ? "USD" : "INR";
    const priceText =
      currency === "USD" ? formatUSD(price) : formatINR(price);
    if (currency === "USD") usdSubtotal += price;
    else inrSubtotal += price;
    const name = p?.productName || "Item";
    return {
      index: idx + 1,
      name,
      priceText,
      currency,
      price,
    };
  });

  const shipping = Number(order?.shippingCost) || 0;
  const packaging = Number(order?.packagingCost) || 0;
  const otherExp = Number(order?.otherExpenses) || 0;
  const extraINR = shipping + packaging + otherExp;
  const totalINR = inrSubtotal + extraINR;

  const summaryRows = [];
  if (inrSubtotal > 0)
    summaryRows.push({ label: "Items subtotal (INR)", value: formatINR(inrSubtotal) });
  if (usdSubtotal > 0)
    summaryRows.push({
      label: "Items subtotal (USD)",
      value: formatUSD(usdSubtotal),
    });
  if (shipping > 0)
    summaryRows.push({ label: "Shipping", value: formatINR(shipping) });
  if (packaging > 0)
    summaryRows.push({ label: "Packaging", value: formatINR(packaging) });
  if (otherExp > 0)
    summaryRows.push({ label: "Other charges", value: formatINR(otherExp) });

  const address = (order?.address || "").trim();

  return {
    brandName,
    greetingName,
    orderId: String(orderId),
    createdAt,
    createdAtFormatted: formatDate(createdAt),
    items,
    summaryRows,
    totalINR,
    totalUSD: usdSubtotal,
    totalINRFormatted: totalINR > 0 ? formatINR(totalINR) : "",
    totalUSDFormatted: usdSubtotal > 0 ? formatUSD(usdSubtotal) : "",
    address,
    inrSubtotal,
    usdSubtotal,
  };
};

/** Build a customer-friendly invoice message body from an order document. */
export const buildOrderInvoiceMessage = (
  order,
  customerName,
  opts = {},
) => {
  const ctx = buildOrderInvoiceContext(order, customerName, opts);
  const itemLines = ctx.items.map(
    (row) => `${row.index}. ${row.name} — ${row.priceText}`,
  );

  const summaryLines = ctx.summaryRows.map((r) => `${r.label}: ${r.value}`);

  const totalLines = [];
  if (ctx.totalINR > 0)
    totalLines.push(`*Total Payable (INR):* ${ctx.totalINRFormatted}`);
  if (ctx.totalUSD > 0)
    totalLines.push(`*Total Payable (USD):* ${ctx.totalUSDFormatted}`);

  const parts = [];
  parts.push(`Namaste ${ctx.greetingName} 🙏`);
  parts.push("");
  parts.push(`Thank you for your order with *${ctx.brandName}*! ✨`);
  parts.push(`We have received your order and started processing it.`);
  parts.push("");
  parts.push(`📋 *Order Invoice*`);
  parts.push(`Order ID: *${ctx.orderId}*`);
  parts.push(`Date: ${ctx.createdAtFormatted}`);
  parts.push("");
  parts.push(`🛍️ *Items:*`);
  if (itemLines.length) parts.push(...itemLines);
  else parts.push("—");

  if (summaryLines.length) {
    parts.push("");
    parts.push(`💰 *Charges:*`);
    parts.push(...summaryLines);
  }

  if (totalLines.length) {
    parts.push("");
    parts.push(...totalLines);
  }

  if (ctx.address) {
    parts.push("");
    parts.push(`📍 *Delivery Address:*`);
    parts.push(ctx.address);
  }

  parts.push("");
  parts.push(`We'll keep you updated on dispatch and tracking details.`);
  parts.push(`For any queries, simply reply to this message.`);
  parts.push("");
  parts.push(`Thank you for choosing ${ctx.brandName}! 💎`);

  return parts.join("\n");
};

export { BRAND_NAME };
