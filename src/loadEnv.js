import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env.NODE_ENV || "production";

let envFile = ".env.prod";

if (env === "staging") {
  envFile = ".env.staging";
}

const envPath = path.resolve(__dirname, `../${envFile}`);

dotenv.config({ path: envPath });
//test
console.log(`ENV loaded from: ${envFile}`);
