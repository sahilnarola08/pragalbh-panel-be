/**
 * One-time repair per deploy: old User indexes used non-sparse unique on email/contactNumber,
 * so only one document could omit phone (E11000 duplicate key { contactNumber: null }).
 * Drops those legacy indexes so Mongoose can create partial unique indexes (only non-empty values).
 */

import mongoose from "mongoose";
import User from "../models/user.js";

export async function repairUserEmailPhoneUniqueIndexes() {
  if (mongoose.connection.readyState !== 1) return;

  const coll = User.collection;
  let indexes;
  try {
    indexes = await coll.indexes();
  } catch (e) {
    console.warn("[userIndexRepair] listIndexes failed:", e.message);
    return;
  }

  for (const idx of indexes) {
    const key = idx.key || {};
    const fields = Object.keys(key);
    if (fields.length !== 1) continue;
    const field = fields[0];
    if ((field === "email" || field === "contactNumber") && idx.unique) {
      const isPartial = !!idx.partialFilterExpression;
      if (isPartial) continue;
      try {
        await coll.dropIndex(idx.name);
        console.log(
          `[userIndexRepair] Dropped legacy unique index "${idx.name}" on users.${field} (recreating as partial unique)`
        );
      } catch (e) {
        console.warn(`[userIndexRepair] Could not drop index ${idx.name}:`, e.message);
      }
    }
  }

  try {
    await User.syncIndexes();
    console.log("[userIndexRepair] User indexes synced");
  } catch (e) {
    console.error("[userIndexRepair] User.syncIndexes failed:", e.message);
    throw e;
  }
}
