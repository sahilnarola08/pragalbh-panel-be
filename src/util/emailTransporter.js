import nodemailer from "nodemailer";
import { secret } from "../config/secret.js";

let cachedTransporter;

/** Shared SMTP transporter for transactional customer emails (invoice, etc.). */
export const getSmtpTransporter = () => {
  if (cachedTransporter !== undefined) return cachedTransporter;
  if (secret.emailService && secret.emailUser && secret.emailPass) {
    cachedTransporter = nodemailer.createTransport({
      service: secret.emailService,
      auth: {
        user: secret.emailUser,
        pass: secret.emailPass,
      },
    });
  } else {
    cachedTransporter = null;
  }
  return cachedTransporter;
};

export const isSmtpConfigured = () => Boolean(getSmtpTransporter());
