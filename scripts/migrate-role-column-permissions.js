/**
 * Migration script: ensures role_column_permissions collection exists with proper indexes.
 * MongoDB creates collections on first insert; this script explicitly creates the collection
 * and indexes for clarity. Safe to run multiple times.
 *
 * Run: node scripts/migrate-role-column-permissions.js
 * (from pragalbh-panel-be directory, with MONGO_URI or connection configured)
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.NODE_ENV === "staging" ? ".env.staging" : ".env.prod";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI or MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const collName = "rolecolumnpermissions"; // Mongoose default collection name
  const collections = await db.listCollections().toArray();
  const exists = collections.some((c) => c.name === collName);

  if (!exists) {
    await db.createCollection(collName);
    console.log(`Created collection: ${collName}`);
  }

  const coll = db.collection(collName);
  const indexes = await coll.indexes();
  const hasUnique = indexes.some(
    (i) => i.unique && i.key?.roleId && i.key?.moduleName && i.key?.tableName && i.key?.columnName
  );
  if (!hasUnique) {
    await coll.createIndex(
      { roleId: 1, moduleName: 1, tableName: 1, columnName: 1 },
      { unique: true }
    );
    console.log("Created unique index on (roleId, moduleName, tableName, columnName)");
  }

  await mongoose.disconnect();
  console.log("Migration complete.");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
