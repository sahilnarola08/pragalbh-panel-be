import nodemailer from "nodemailer";
import { decrypt, isEncrypted } from "../util/crypto.js";
import { secret } from "../config/secret.js";
import { getSmtpTransporter } from "../util/emailTransporter.js";

const decryptSmtpPassword = (stored) => {
  if (!stored || typeof stored !== "string") return "";
  if (isEncrypted(stored)) return decrypt(stored);
  return stored;
};

/**
 * Build a Nodemailer transport from a MessagingIntegration `emailSmtp` subdoc.
 * @param {object} integration — lean or document with `emailSmtp`
 * @returns {import("nodemailer").Transporter | null}
 */
export function createTransporterFromEmailIntegration(integration) {
  const cfg = integration?.emailSmtp;
  if (!cfg?.host?.trim() || !cfg?.authUser?.trim()) return null;
  let pass = "";
  try {
    pass = decryptSmtpPassword(cfg.authPassword);
  } catch {
    return null;
  }
  if (!pass) return null;
  const port = Number(cfg.port) || 587;
  return nodemailer.createTransport({
    host: String(cfg.host).trim(),
    port,
    secure: Boolean(cfg.secure),
    auth: {
      user: String(cfg.authUser).trim(),
      pass,
    },
  });
}

/** Nodemailer `from` value: string or { name, address }. */
export function getFromAddressForEmailIntegration(integration) {
  const cfg = integration?.emailSmtp;
  const address = String(cfg?.fromEmail || cfg?.authUser || "").trim();
  const name = String(cfg?.fromName || "").trim();
  if (!address) return null;
  return name ? { name, address } : address;
}

export function getReplyToForEmailIntegration(integration) {
  const r = integration?.emailSmtp?.replyTo;
  const t = String(r || "").trim();
  return t || undefined;
}

/**
 * Send mail using an email integration's SMTP when usable; otherwise fall back
 * to global env SMTP (`getSmtpTransporter` + `secret.emailUser`).
 *
 * @returns {Promise<{ usedIntegration: boolean }>}
 */
export async function sendMailWithEmailIntegrationOrEnv({
  integration = null,
  to,
  subject,
  html,
  text,
}) {
  let transporter = integration
    ? createTransporterFromEmailIntegration(integration)
    : null;
  const usedIntegration = Boolean(transporter);
  if (!transporter) {
    transporter = getSmtpTransporter();
  }
  if (!transporter) {
    const err = new Error(
      "No SMTP is available. Add an Email integration with host, SMTP user, and password under Messaging (map it to platforms or set as default), or configure SERVICE, EMAIL_USER, and EMAIL_PASS on the server.",
    );
    err.statusCode = 503;
    throw err;
  }

  const from = usedIntegration
    ? getFromAddressForEmailIntegration(integration) || secret.emailUser
    : secret.emailUser;
  const replyTo = usedIntegration
    ? getReplyToForEmailIntegration(integration)
    : undefined;

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
  return { usedIntegration };
}
