import Master from "../models/master.js";

/**
 * Removes the old global unique index on (name, master, isDeleted) if it is still
 * non-partial. That index blocks creating a platform account with the same display
 * name as a category master under the same Master asset.
 */
export async function syncMasterIndexesSafe() {
  try {
    const coll = Master.collection;
    let indexes = [];
    try {
      indexes = await coll.indexes();
    } catch (e) {
      console.warn("[Master] Could not list indexes:", e.message);
      return;
    }

    for (const idx of indexes) {
      const name = idx?.name;
      if (!name || name === "_id_") continue;

      const key = idx.key || {};
      const isNameMasterDeleted =
        key.name === 1 && key.master === 1 && key.isDeleted === 1;

      if (!isNameMasterDeleted) continue;

      const isNewPartial =
        name === "uniq_master_name_asset_root" ||
        name === "uniq_master_name_asset_under_platform";

      if (isNewPartial) continue;

      if (idx.partialFilterExpression) continue;

      try {
        await coll.dropIndex(name);
        console.log(`[Master] Dropped legacy non-partial index: ${name}`);
      } catch (e) {
        console.warn(`[Master] dropIndex ${name}:`, e.message);
      }
    }

    try {
      await Master.syncIndexes();
      console.log("[Master] syncIndexes() completed.");
    } catch (e) {
      console.error("[Master] syncIndexes() failed:", e.message);
    }
  } catch (e) {
    console.error("[Master] syncMasterIndexesSafe failed:", e.message);
  }
}
