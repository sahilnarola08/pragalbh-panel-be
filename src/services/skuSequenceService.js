import SkuSequence from "../models/skuSequence.js";

/**
 * Atomically increment and return next sequence number for a scope.
 */
export async function getNextSequence(scopeKey, options = {}) {
  const { resetYearly = false } = options;
  const year = resetYearly ? new Date().getFullYear() : null;
  const key =
    resetYearly && year ? `${scopeKey}:year:${year}` : scopeKey;

  const doc = await SkuSequence.findOneAndUpdate(
    { scopeKey: key },
    {
      $inc: { currentValue: 1 },
      $setOnInsert: { scopeKey: key, resetYearly, year },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return doc.currentValue;
}

export function buildScopeKey(parts) {
  return parts.filter(Boolean).join(":");
}
