import RoleColumnPermission from "../models/roleColumnPermission.js";
import { TABLE_COLUMN_DEFINITIONS } from "../data/tableColumnDefinitions.js";

/** In-memory cache: short TTL so admin changes reflect quickly (30s) */
const cache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const cacheTimestamps = new Map();

/** Always use string for roleId so cache key is consistent (ObjectId vs string) */
function normalizeRoleId(roleId) {
  if (roleId == null) return null;
  if (typeof roleId === "string") return roleId;
  if (typeof roleId === "object" && roleId._id) return String(roleId._id);
  return String(roleId);
}

function cacheKey(roleId, moduleName, tableName) {
  const rid = normalizeRoleId(roleId);
  return rid ? `${rid}:${moduleName}:${tableName}` : null;
}

function getFromCache(roleId, moduleName, tableName) {
  const key = cacheKey(roleId, moduleName, tableName);
  if (!key) return undefined;
  const ts = cacheTimestamps.get(key);
  if (ts && Date.now() - ts < CACHE_TTL_MS) {
    return cache.get(key);
  }
  cache.delete(key);
  cacheTimestamps.delete(key);
  return undefined;
}

function setCache(roleId, moduleName, tableName, visibleColumns) {
  const key = cacheKey(roleId, moduleName, tableName);
  if (key) {
    cache.set(key, visibleColumns);
    cacheTimestamps.set(key, Date.now());
  }
}

export function invalidateColumnPermissionCache(roleId) {
  const rid = normalizeRoleId(roleId);
  if (rid) {
    const prefix = `${rid}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        cacheTimestamps.delete(key);
      }
    }
  } else {
    cache.clear();
    cacheTimestamps.clear();
  }
}

/**
 * Get visible columns for a role in a module/table.
 * Rules:
 * - If NO permissions exist for (roleId, moduleName, tableName) → return all columns (default behavior)
 * - If permissions exist → return only columns with isVisible=true
 */
export async function getVisibleColumns(roleId, moduleName, tableName) {
  const rid = normalizeRoleId(roleId);
  if (!rid || !moduleName || !tableName) {
    return null; // null = no filtering, show all
  }

  const cached = getFromCache(rid, moduleName, tableName);
  if (cached !== undefined) {
    return cached;
  }

  const def = TABLE_COLUMN_DEFINITIONS[moduleName]?.[tableName];
  const allColumnIds = def?.columns?.map((c) => c.id) ?? [];

  const perms = await RoleColumnPermission.find({
    roleId: rid,
    moduleName,
    tableName,
  }).lean();

  if (perms.length === 0) {
    setCache(rid, moduleName, tableName, null);
    return null; // No permissions = show all columns
  }

  const visible = perms
    .filter((p) => p.isVisible)
    .map((p) => p.columnName)
    .filter((id) => allColumnIds.includes(id));

  setCache(rid, moduleName, tableName, visible);
  return visible;
}

/**
 * Get current column permissions for a role (for admin UI).
 */
export async function getColumnPermissionsForRole(roleId, moduleName, tableName) {
  const def = TABLE_COLUMN_DEFINITIONS[moduleName]?.[tableName];
  if (!def) return { columns: [], tableLabel: "", moduleLabel: "" };

  const perms = await RoleColumnPermission.find({
    roleId,
    moduleName,
    tableName,
  }).lean();

  const permMap = new Map(perms.map((p) => [p.columnName, p.isVisible]));
  const hasAnyPerms = perms.length > 0;

  const columns = def.columns.map((col) => ({
    id: col.id,
    label: col.label,
    isVisible: hasAnyPerms ? (permMap.get(col.id) ?? true) : true,
  }));

  return {
    columns,
    tableLabel: def.label,
    moduleLabel: moduleName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

/**
 * Save column permissions for a role.
 */
export async function saveColumnPermissions(roleId, moduleName, tableName, columnVisibility) {
  invalidateColumnPermissionCache(normalizeRoleId(roleId));

  const def = TABLE_COLUMN_DEFINITIONS[moduleName]?.[tableName];
  if (!def) {
    throw new Error(`Unknown module/table: ${moduleName}/${tableName}`);
  }

  const validIds = new Set(def.columns.map((c) => c.id));
  const ops = [];

  for (const [columnName, isVisible] of Object.entries(columnVisibility)) {
    if (!validIds.has(columnName)) continue;
    ops.push({
      updateOne: {
        filter: { roleId, moduleName, tableName, columnName },
        update: { $set: { isVisible: !!isVisible } },
        upsert: true,
      },
    });
  }

  if (ops.length > 0) {
    await RoleColumnPermission.bulkWrite(ops);
  }

  return getVisibleColumns(roleId, moduleName, tableName);
}

/**
 * Get all module/table definitions for admin UI dropdowns.
 */
/**
 * Filter order objects to remove fields for hidden columns (backend security).
 * Only applies when visibleColumns is an array; null means no filtering.
 */
export function filterOrdersForColumnPermissions(orders, visibleColumns) {
  if (!visibleColumns || !Array.isArray(visibleColumns) || visibleColumns.length === 0) {
    return orders;
  }
  const allowed = new Set(visibleColumns);
  return orders.map((order) => {
    const result = { ...order };
    if (!allowed.has("netProfit")) {
      delete result.netProfit;
      delete result.estimatedProfit;
      delete result.totalActualINR;
      delete result.totalExpenses;
      delete result.totalExpectedINR;
    }
    if (!allowed.has("paymentStatus")) delete result.paymentStatus;
    if (result.products && Array.isArray(result.products)) {
      result.products = result.products.map((p) => {
        const prod = { ...p };
        if (!allowed.has("purchasePrice")) delete prod.purchasePrice;
        if (!allowed.has("sellingPrice")) delete prod.sellingPrice;
        return prod;
      });
    }
    return result;
  });
}

export function getModuleTableDefinitions() {
  const result = [];
  for (const [moduleName, tables] of Object.entries(TABLE_COLUMN_DEFINITIONS)) {
    for (const [tableName, def] of Object.entries(tables)) {
      result.push({
        moduleName,
        tableName,
        tableLabel: def.label,
        moduleLabel: moduleName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      });
    }
  }
  return result;
}
