import {
  buildOrderInvoiceContext,
  buildOrderInvoiceMessage,
} from "./invoiceMessageBuilder.js";

const escapeHtml = (s) => {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/** @param {object} ctx — output shape of buildOrderInvoiceContext */
const buildInvoiceHtmlFromContext = (ctx) => {
  const brand = escapeHtml(ctx.brandName);
  const greeting = escapeHtml(ctx.greetingName);
  const orderId = escapeHtml(ctx.orderId);
  const date = escapeHtml(ctx.createdAtFormatted);
  const address = escapeHtml(ctx.address);

  const itemRows =
    ctx.items.length === 0
      ? `<tr><td colspan="3" style="padding:14px 16px;color:#64748b;font-size:14px;">No line items</td></tr>`
      : ctx.items
          .map(
            (row) => `
<tr>
  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;">${row.index}</td>
  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;">${escapeHtml(row.name)}</td>
  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;text-align:right;white-space:nowrap;font-weight:600;">${escapeHtml(row.priceText)}</td>
</tr>`,
          )
          .join("");

  const summaryRows =
    ctx.summaryRows.length === 0
      ? ""
      : ctx.summaryRows
          .map(
            (r) => `
<tr>
  <td colspan="2" style="padding:8px 16px;font-size:13px;color:#475569;">${escapeHtml(r.label)}</td>
  <td style="padding:8px 16px;font-size:13px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(r.value)}</td>
</tr>`,
          )
          .join("");

  const totalBlock = [];
  if (ctx.totalINR > 0) {
    totalBlock.push(`
<tr>
  <td colspan="2" style="padding:14px 16px 8px;font-size:15px;color:#0f172a;font-weight:700;">Total payable (INR)</td>
  <td style="padding:14px 16px 8px;font-size:15px;color:#b45309;text-align:right;font-weight:800;">${escapeHtml(ctx.totalINRFormatted)}</td>
</tr>`);
  }
  if (ctx.totalUSD > 0) {
    totalBlock.push(`
<tr>
  <td colspan="2" style="padding:8px 16px;font-size:15px;color:#0f172a;font-weight:700;">Total payable (USD)</td>
  <td style="padding:8px 16px;font-size:15px;color:#0f172a;text-align:right;font-weight:800;">${escapeHtml(ctx.totalUSDFormatted)}</td>
</tr>`);
  }

  const addressBlock = ctx.address
    ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Delivery address</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#334155;white-space:pre-wrap;">${address}</p>
    </td>
  </tr>
</table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Order invoice</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);padding:28px 24px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#cbd5e1;">Invoice</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:0.02em;">${brand}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#0f172a;">Namaste <strong>${greeting}</strong>,</p>
              <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:#475569;">Thank you for your order. We have received it and started processing. Below is your order summary.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;">Order ID</td>
                        <td style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;text-align:right;">Date</td>
                      </tr>
                      <tr>
                        <td style="padding-top:6px;font-size:17px;font-weight:800;color:#78350f;">${orderId}</td>
                        <td style="padding-top:6px;font-size:15px;color:#78350f;text-align:right;">${date}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Line items</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <tr style="background:#f8fafc;">
                  <th align="left" style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;width:40px;">#</th>
                  <th align="left" style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Item</th>
                  <th align="right" style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Amount</th>
                </tr>
                ${itemRows}
              </table>
              ${
                ctx.summaryRows.length || totalBlock.length
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fafafa;">
                ${summaryRows}
                ${totalBlock.join("")}
              </table>`
                  : ""
              }
              ${addressBlock}
              <p style="margin:24px 0 0;font-size:14px;line-height:1.65;color:#475569;">We will keep you updated on dispatch and tracking. For any questions, simply reply to this email.</p>
              <p style="margin:16px 0 0;font-size:14px;color:#0f172a;font-weight:600;">Thank you for choosing ${brand}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">This is an automated message regarding your order. Please do not share sensitive payment details by email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * @param {object} order — Mongoose lean order doc
 * @param {string} [customerName]
 * @param {{ brandName?: string }} [opts]
 * @returns {{ subject: string, html: string, text: string }}
 */
export const buildOrderInvoiceEmail = (order, customerName, opts = {}) => {
  const ctx = buildOrderInvoiceContext(order, customerName, opts);
  const subject = `Order invoice — ${ctx.orderId} — ${ctx.brandName}`;
  const html = buildInvoiceHtmlFromContext(ctx);
  const text = buildOrderInvoiceMessage(order, customerName, opts);
  return { subject, html, text };
};

/** Demo order for template preview when no real order is loaded. */
export const getDemoOrderForInvoicePreview = () => ({
  orderId: "PJ-DEMO-0001",
  clientName: "Sample Customer",
  createdAt: new Date(),
  address: "12, Sample Street, Bandra West\nMumbai, Maharashtra 400050",
  shippingCost: 250,
  packagingCost: 120,
  otherExpenses: 0,
  products: [
    {
      productName: "22K Gold Ring — Classic Band",
      sellingPrice: 48500,
      paymentCurrency: "INR",
    },
    {
      productName: "Diamond Stud Earrings (VS clarity)",
      sellingPrice: 128000,
      paymentCurrency: "INR",
    },
  ],
});
