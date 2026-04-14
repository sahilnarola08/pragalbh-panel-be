import crypto from "crypto";

const CRM_ENCRYPTION_KEY = process.env.CRM_ENCRYPTION_KEY || "";

const getKey = () => {
  if (!CRM_ENCRYPTION_KEY) {
    throw new Error("CRM_ENCRYPTION_KEY is required for CRM integration");
  }
  return crypto.createHash("sha256").update(CRM_ENCRYPTION_KEY).digest();
};

export const encryptText = (plainText) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};

export const decryptText = (cipherText) => {
  const [ivHex, tagHex, dataHex] = String(cipherText || "").split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");
