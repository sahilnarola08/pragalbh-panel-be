import Auth from "../models/auth.js";
import Role from "../models/role.js";

const permissionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(userId) {
  return `perms:${userId}`;
}

function getCached(userId) {
  const entry = permissionCache.get(cacheKey(userId));
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    permissionCache.delete(cacheKey(userId));
    return null;
  }
  return entry.permissions;
}

function setCached(userId, permissions) {
  permissionCache.set(cacheKey(userId), {
    permissions,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidatePermissionCache(userId) {
  if (userId) permissionCache.delete(cacheKey(userId));
  else permissionCache.clear();
}

export async function getEffectivePermissions(userId) {
  const cached = getCached(userId);
  if (cached) return cached;

  const user = await Auth.findById(userId)
    .select("roleId customPermissions")
    .populate("roleId", "permissions");
  if (!user) return [];

  const rolePerms = user.roleId?.permissions || [];
  const custom = user.customPermissions || [];
  const effective = [...new Set([...rolePerms, ...custom])];
  setCached(userId, effective);
  return effective;
}

export async function hasPermission(userId, permissionName) {
  const perms = await getEffectivePermissions(userId);
  return perms.includes(permissionName);
}
