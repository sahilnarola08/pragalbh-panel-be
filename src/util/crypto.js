import crypto from "crypto";

/**
 * AES-256-GCM authenticated encryption for sensitive at-rest secrets such as
 * Telegram MTProto session strings, api hashes, and 2FA passwords.
 *
 * Usage:
 *   const cipher = encrypt("my secret");        // returns base64 string
 *   const plain  = decrypt(cipher);             // returns original
 *
 * Format of the cipher payload (base64-encoded):
 *   [version:1 byte][iv:12 bytes][authTag:16 bytes][ciphertext:N bytes]
 *
 * Why a version byte: keeps room to rotate algorithms / keys later without
 * breaking previously stored values.
 */

const VERSION = 0x01;
const ALG = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey = null;
let warnedMissing = false;

const loadKey = () => {
  if (cachedKey) return cachedKey;
  const raw = String(process.env.MESSAGING_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  let buf;
  if (/^[a-f0-9]+$/i.test(raw) && raw.length === KEY_BYTES * 2) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "utf8");
  }
  if (buf.length < KEY_BYTES) {
    // Stretch via SHA-256 so short keys still produce a 32-byte derived key.
    buf = crypto.createHash("sha256").update(buf).digest();
  } else if (buf.length > KEY_BYTES) {
    buf = buf.subarray(0, KEY_BYTES);
  }
  cachedKey = buf;
  return cachedKey;
};

export const isEncryptionAvailable = () => Boolean(loadKey());

export const warnIfMissingKey = () => {
  if (warnedMissing) return;
  if (!isEncryptionAvailable()) {
    warnedMissing = true;
    console.warn(
      "[crypto] MESSAGING_ENCRYPTION_KEY is not set. Telegram credentials cannot be saved/used until you set a 64-char hex (32 bytes) value in your .env. Generate one with: openssl rand -hex 32",
    );
  }
};

export const encrypt = (plain) => {
  if (plain === undefined || plain === null) return "";
  const text = String(plain);
  if (!text) return "";
  const key = loadKey();
  if (!key) {
    throw new Error(
      "MESSAGING_ENCRYPTION_KEY is not configured. Cannot encrypt secrets.",
    );
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]).toString(
    "base64",
  );
};

export const decrypt = (payload) => {
  if (!payload) return "";
  const key = loadKey();
  if (!key) {
    throw new Error(
      "MESSAGING_ENCRYPTION_KEY is not configured. Cannot decrypt secrets.",
    );
  }
  const buf = Buffer.from(String(payload), "base64");
  if (buf.length < 1 + IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Encrypted payload is malformed.");
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
};

/** Convenience: returns true if value looks like our encrypted format. */
export const isEncrypted = (value) => {
  if (!value || typeof value !== "string") return false;
  try {
    const buf = Buffer.from(value, "base64");
    return (
      buf.length >= 1 + IV_BYTES + TAG_BYTES + 1 && buf[0] === VERSION
    );
  } catch {
    return false;
  }
};
