import crypto from "crypto";
import { Transform } from "stream";

function deriveKey(raw) {
  const v = String(raw || "");
  if (!v) throw new Error("BACKUP_ENCRYPTION_KEY is required");
  // Accept hex/base64 or any string; derive 32 bytes using sha256 if needed
  let buf = null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(v)) buf = Buffer.from(v, "hex");
    else if (/^[A-Za-z0-9+/=]{43,}$/.test(v)) buf = Buffer.from(v, "base64");
  } catch {
    buf = null;
  }
  if (!buf || buf.length !== 32) {
    buf = crypto.createHash("sha256").update(v).digest();
  }
  return buf;
}

const HEADER = Buffer.from("BKP1"); // 4 bytes
const IV_LEN = 12;
const TAG_LEN = 16;

export function createEncryptStream() {
  const key = deriveKey(process.env.BACKUP_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let headerSent = false;

  const out = new Transform({
    transform(chunk, _enc, cb) {
      try {
        if (!headerSent) {
          this.push(HEADER);
          this.push(iv);
          headerSent = true;
        }
        const buf = cipher.update(chunk);
        if (buf?.length) this.push(buf);
        cb();
      } catch (e) {
        cb(e);
      }
    },
    flush(cb) {
      try {
        if (!headerSent) {
          this.push(HEADER);
          this.push(iv);
          headerSent = true;
        }
        const fin = cipher.final();
        if (fin?.length) this.push(fin);
        const tag = cipher.getAuthTag();
        this.push(tag);
        cb();
      } catch (e) {
        cb(e);
      }
    },
  });

  return out;
}

export function createDecryptStream() {
  const key = deriveKey(process.env.BACKUP_ENCRYPTION_KEY);
  let headerBuf = Buffer.alloc(0);
  let decipher = null;
  let tail = Buffer.alloc(0); // keep last TAG_LEN bytes

  const out = new Transform({
    transform(chunk, _enc, cb) {
      try {
        // Need HEADER(4)+IV(12) before we can start decrypting
        if (!decipher) {
          headerBuf = Buffer.concat([headerBuf, chunk]);
          if (headerBuf.length < HEADER.length + IV_LEN) return cb();

          const hdr = headerBuf.subarray(0, HEADER.length);
          if (!hdr.equals(HEADER)) throw new Error("Invalid backup header");
          const iv = headerBuf.subarray(HEADER.length, HEADER.length + IV_LEN);
          decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

          const rest = headerBuf.subarray(HEADER.length + IV_LEN);
          headerBuf = Buffer.alloc(0);
          if (rest.length) return this._transform(rest, _enc, cb);
          return cb();
        }

        // Buffer last TAG_LEN bytes until flush
        const combined = Buffer.concat([tail, chunk]);
        if (combined.length <= TAG_LEN) {
          tail = combined;
          return cb();
        }
        const dataPart = combined.subarray(0, combined.length - TAG_LEN);
        tail = combined.subarray(combined.length - TAG_LEN);
        const buf = decipher.update(dataPart);
        if (buf?.length) this.push(buf);
        cb();
      } catch (e) {
        cb(e);
      }
    },
    flush(cb) {
      try {
        if (!decipher) throw new Error("Invalid encrypted stream");
        if (tail.length !== TAG_LEN) throw new Error("Invalid auth tag");
        decipher.setAuthTag(tail);
        const fin = decipher.final();
        if (fin?.length) this.push(fin);
        cb();
      } catch (e) {
        cb(e);
      }
    },
  });

  return out;
}

