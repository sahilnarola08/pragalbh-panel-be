import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath });
if (result.error && result.error.code !== "ENOENT") {
  console.warn("[dotenv] Could not load .env:", result.error.message);
}
